import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createClubSchema, clubPage } from "@/lib/clubs";
import { clubReply, clubSummary } from "@/lib/club-server";
import { sameOriginJson } from "@/lib/book-journal";
export async function GET(request: Request) {
  const s = await auth();
  if (!s?.user.id) return clubReply({ error: "Sign in first." }, 401);
  const p = new URL(request.url).searchParams,
    page = clubPage(p.get("page")),
    mine = p.get("mine") === "true";
  const clubs = await prisma.bookClub.findMany({
    where: {
      deletedAt: null,
      ...(mine
        ? { members: { some: { userId: s.user.id, active: true } } }
        : { isPublic: true }),
    },
    include: {
      members: { where: { userId: s.user.id } },
      _count: { select: { members: { where: { active: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: page * 20,
    take: 21,
  });
  return clubReply({
    clubs: clubs
      .slice(0, 20)
      .map((c) => clubSummary(c, c.members[0], s.user.id, c._count.members)),
    hasMore: clubs.length > 20,
  });
}
export async function POST(request: Request) {
  const s = await auth();
  if (!s?.user.id) return clubReply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return clubReply({ error: "Use Folio on this site." }, 403);
  const parsed = createClubSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return clubReply(
      {
        error:
          "Provide a club name, description, privacy choice and your club display name.",
      },
      400,
    );
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.id}))`;
      const old = await db.bookClub.findUnique({
        where: { id: parsed.data.id },
      });
      const d = parsed.data;
      if (old)
        return old.ownerId === s.user.id &&
          !old.deletedAt &&
          old.version === 0 &&
          old.name === d.name &&
          old.description === d.description &&
          old.isPublic === d.isPublic
          ? { status: 200, id: old.id }
          : {
              status: 409,
              error:
                "This creation request was already used. Reload before creating another club.",
            };
      const { alias, ...data } = d;
      const club = await db.bookClub.create({
        data: {
          ...data,
          ownerId: s.user.id,
          members: { create: { userId: s.user.id, alias } },
        },
      });
      return { status: 200, id: club.id };
    });
    return clubReply(result, result.status);
  } catch {
    return clubReply(
      {
        error:
          "Could not create the club. Your draft is still here; try again.",
      },
      503,
    );
  }
}
