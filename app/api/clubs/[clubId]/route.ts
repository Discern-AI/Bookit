import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { clubActionSchema, clubPage } from "@/lib/clubs";
import { clubReply, clubSummary, inviteHash } from "@/lib/club-server";
import { sameOriginJson } from "@/lib/book-journal";
type Context = { params: { clubId: string } };
export async function GET(request: Request, { params }: Context) {
  const s = await auth();
  if (!s?.user.id) return clubReply({ error: "Sign in first." }, 401);
  if (!z.string().uuid().safeParse(params.clubId).success)
    return clubReply({ error: "Club not found." }, 404);
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.clubId}))`;
    const c = await db.bookClub.findFirst({
      where: { id: params.clubId, deletedAt: null },
      include: {
        members: { where: { userId: s.user.id } },
        _count: { select: { members: { where: { active: true } } } },
      },
    });
    const member = c?.members[0];
    if (!c || (!c.isPublic && !member?.active))
      return clubReply({ error: "Club not found." }, 404);
    const club = clubSummary(c, member, s.user.id, c._count.members);
    if (!member?.active)
      return clubReply({
        club,
        readings: [],
        posts: [],
        members: [],
        selected: null,
        moreReadings: false,
        morePosts: false,
        moreMembers: false,
      });
    const p = new URL(request.url).searchParams,
      readingId = p.get("reading");
    if (readingId && !z.string().uuid().safeParse(readingId).success)
      return clubReply({ error: "Reading not found." }, 404);
    const readings = await db.bookClubReading.findMany({
      where: { clubId: c.id, deletedAt: null },
      include: {
        work: { select: { id: true, title: true, authorName: true } },
      },
      orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: clubPage(p.get("readingsPage")) * 20,
      take: 21,
    });
    const selected = readingId
      ? await db.bookClubReading.findFirst({
          where: { id: readingId, clubId: c.id, deletedAt: null },
          include: {
            work: { select: { id: true, title: true, authorName: true } },
          },
        })
      : (readings[0] ?? null);
    if (readingId && !selected)
      return clubReply({ error: "Reading not found." }, 404);
    const [posts, members] = await Promise.all([
      selected
        ? db.bookClubPost.findMany({
            where: { readingId: selected.id, deletedAt: null },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: clubPage(p.get("postsPage")) * 20,
            take: 21,
            select: {
              id: true,
              userId: true,
              body: true,
              authorAlias: true,
              spoilerPage: true,
              version: true,
              createdAt: true,
            },
          })
        : [],
      db.bookClubMember.findMany({
        where: { clubId: c.id, active: true },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        skip: clubPage(p.get("membersPage")) * 20,
        take: 21,
        select: { userId: true, alias: true, version: true },
      }),
    ]);
    return clubReply({
      club,
      readings: readings.slice(0, 20),
      selected,
      posts: posts
        .slice(0, 20)
        .map(({ userId, ...post }) => ({ ...post, own: userId === s.user.id })),
      members: members
        .slice(0, 20)
        .map((m) => ({ ...m, self: m.userId === s.user.id })),
      moreReadings: readings.length > 20,
      morePosts: posts.length > 20,
      moreMembers: members.length > 20,
    });
  });
}
export async function PATCH(request: Request, { params }: Context) {
  const s = await auth();
  if (!s?.user.id) return clubReply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return clubReply({ error: "Use Folio on this site." }, 403);
  const parsed = clubActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !z.string().uuid().safeParse(params.clubId).success)
    return clubReply(
      { error: "Check the form, dates and saved version." },
      400,
    );
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.clubId}))`;
      const c = await db.bookClub.findUnique({ where: { id: params.clubId } });
      if (!c || c.deletedAt) return { status: 404, error: "Club not found." };
      const m = await db.bookClubMember.findUnique({
        where: { clubId_userId: { clubId: c.id, userId: s.user.id } },
      });
      const owner = c.ownerId === s.user.id,
        d = parsed.data;
      const conflict = {
        status: 409,
        error:
          "This changed elsewhere. Reload the club before trying again. Your draft is still here.",
      };
      if (d.action === "join") {
        if (m?.blocked)
          return { status: 403, error: "You cannot rejoin this club." };
        if (c.version !== d.version) return conflict;
        if (
          !c.isPublic &&
          (!d.invite || !c.inviteHash || inviteHash(d.invite) !== c.inviteHash)
        )
          return { status: 404, error: "This invitation is unavailable." };
        const expected = d.membershipVersion;
        if (m?.active)
          return ((expected === null && m.version === 0) ||
            m.version === expected ||
            m.version === (expected ?? -2) + 1) &&
            m.alias === d.alias
            ? { status: 200 }
            : conflict;
        if ((m?.version ?? null) !== expected) return conflict;
        if (m)
          await db.bookClubMember.update({
            where: { clubId_userId: { clubId: c.id, userId: s.user.id } },
            data: { active: true, alias: d.alias, version: { increment: 1 } },
          });
        else
          await db.bookClubMember.create({
            data: { clubId: c.id, userId: s.user.id, alias: d.alias },
          });
        return { status: 200 };
      }
      if (!m?.active) return { status: 404, error: "Club not found." };
      if (d.action === "leave") {
        if (owner)
          return {
            status: 400,
            error: "The owner must delete the club instead of leaving it.",
          };
        if (m.version !== d.version) return conflict;
        await db.bookClubMember.update({
          where: { clubId_userId: { clubId: c.id, userId: s.user.id } },
          data: { active: false, version: { increment: 1 } },
        });
        return { status: 200 };
      }
      if (d.action === "post") {
        const reading = await db.bookClubReading.findFirst({
          where: { id: d.readingId, clubId: c.id, deletedAt: null },
        });
        if (!reading) return { status: 404, error: "Reading not found." };
        const old = await db.bookClubPost.findUnique({ where: { id: d.id } });
        if (old && (old.userId !== s.user.id || old.readingId !== reading.id))
          return { status: 404, error: "Post not found." };
        if (old?.deletedAt) return conflict;
        if (
          old &&
          old.version === d.version &&
          old.body === d.body &&
          old.spoilerPage === d.spoilerPage
        )
          return { status: 200 };
        if ((old?.version ?? 0) !== d.version) return conflict;
        if (old)
          await db.bookClubPost.update({
            where: { id: old.id },
            data: {
              body: d.body,
              spoilerPage: d.spoilerPage,
              version: { increment: 1 },
            },
          });
        else
          await db.bookClubPost.create({
            data: {
              id: d.id,
              readingId: reading.id,
              userId: s.user.id,
              authorAlias: m.alias,
              body: d.body,
              spoilerPage: d.spoilerPage,
            },
          });
        return { status: 200 };
      }
      if (d.action === "deletePost") {
        const post = await db.bookClubPost.findFirst({
          where: { id: d.id, reading: { clubId: c.id, deletedAt: null } },
        });
        if (!post || (!owner && post.userId !== s.user.id))
          return { status: 404, error: "Post not found." };
        if (post.deletedAt || post.version !== d.version) return conflict;
        await db.bookClubPost.update({
          where: { id: post.id },
          data: {
            body: "",
            spoilerPage: null,
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        return { status: 200 };
      }
      if (!owner)
        return { status: 403, error: "Only the club owner can do that." };
      if (d.action === "removeMember") {
        if (d.userId === s.user.id)
          return { status: 400, error: "The owner cannot be removed." };
        const other = await db.bookClubMember.findUnique({
          where: { clubId_userId: { clubId: c.id, userId: d.userId } },
        });
        if (!other || !other.active || other.version !== d.version)
          return conflict;
        await db.bookClubMember.update({
          where: { clubId_userId: { clubId: c.id, userId: d.userId } },
          data: { active: false, blocked: true, version: { increment: 1 } },
        });
        return { status: 200 };
      }
      if (d.action === "reading") {
        const old = await db.bookClubReading.findUnique({
          where: { id: d.id },
        });
        if (old && (old.clubId !== c.id || old.workId !== d.workId))
          return { status: 404, error: "Reading not found." };
        if (old?.deletedAt || (old?.version ?? 0) !== d.version)
          return conflict;
        if (
          !old &&
          !(await db.userBook.findFirst({
            where: { userId: s.user.id, edition: { workId: d.workId } },
            select: { id: true },
          }))
        )
          return { status: 400, error: "Choose a book from your library." };
        const dates = {
          startsOn: d.startsOn ? new Date(`${d.startsOn}T12:00:00Z`) : null,
          endsOn: d.endsOn ? new Date(`${d.endsOn}T12:00:00Z`) : null,
        };
        if (
          old &&
          old.startsOn?.toISOString() === dates.startsOn?.toISOString() &&
          old.endsOn?.toISOString() === dates.endsOn?.toISOString()
        )
          return { status: 200 };
        if (old)
          await db.bookClubReading.update({
            where: { id: old.id },
            data: { ...dates, version: { increment: 1 } },
          });
        else
          await db.bookClubReading.create({
            data: { id: d.id, clubId: c.id, workId: d.workId, ...dates },
          });
        return { status: 200 };
      }
      if (d.action === "removeReading") {
        const reading = await db.bookClubReading.findFirst({
          where: { id: d.id, clubId: c.id, deletedAt: null },
        });
        if (!reading || reading.version !== d.version) return conflict;
        await db.bookClubReading.update({
          where: { id: reading.id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        await db.bookClubPost.updateMany({
          where: { readingId: reading.id, deletedAt: null },
          data: {
            deletedAt: new Date(),
            body: "",
            spoilerPage: null,
            version: { increment: 1 },
          },
        });
        return { status: 200 };
      }
      if (c.version !== d.version) return conflict;
      if (d.action === "update")
        await db.bookClub.update({
          where: { id: c.id },
          data: {
            name: d.name,
            description: d.description,
            isPublic: d.isPublic,
            version: { increment: 1 },
          },
        });
      if (d.action === "invite") {
        const invite = randomBytes(32).toString("hex");
        await db.bookClub.update({
          where: { id: c.id },
          data: { inviteHash: inviteHash(invite), version: { increment: 1 } },
        });
        return { status: 200, invite };
      }
      if (d.action === "revokeInvite")
        await db.bookClub.update({
          where: { id: c.id },
          data: { inviteHash: null, version: { increment: 1 } },
        });
      if (d.action === "delete") {
        await db.bookClub.update({
          where: { id: c.id },
          data: {
            deletedAt: new Date(),
            inviteHash: null,
            name: "Deleted club",
            description: "",
            version: { increment: 1 },
          },
        });
        await db.bookClubMember.updateMany({
          where: { clubId: c.id },
          data: { active: false, version: { increment: 1 } },
        });
        await db.bookClubPost.updateMany({
          where: { reading: { clubId: c.id }, deletedAt: null },
          data: {
            body: "",
            spoilerPage: null,
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      return { status: 200 };
    });
    return clubReply(result, result.status);
  } catch {
    return clubReply(
      {
        error:
          "Could not save this change. Your draft is still here; try again.",
      },
      503,
    );
  }
}
