import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { prisma } from "@/lib/prisma";
import { readingKitSchema } from "@/lib/reading-kit";

const saveSchema = z.object({
  kitId: z.string().uuid(),
  version: z.number().int().min(0),
  kit: readingKitSchema,
});
const deleteSchema = z.object({
  kitId: z.string().uuid(),
  version: z.number().int().positive(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const page = Number(params.get("page") ?? 0);
  if (q.length > 100 || !Number.isInteger(page) || page < 0 || page > 100000)
    return NextResponse.json(
      { error: "Invalid reading kit search." },
      { status: 400 },
    );
  const kits = await prisma.readingKit.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { notes: { contains: q, mode: "insensitive" as const } },
              { makeDo: { contains: q, mode: "insensitive" as const } },
              { creatorEssay: { contains: q, mode: "insensitive" as const } },
              { suggestedOrder: { contains: q, mode: "insensitive" as const } },
              {
                publicDescription: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                items: {
                  some: {
                    title: { contains: q, mode: "insensitive" as const },
                  },
                },
              },
              {
                items: {
                  some: {
                    details: { contains: q, mode: "insensitive" as const },
                  },
                },
              },
              {
                entries: {
                  some: {
                    work: {
                      title: { contains: q, mode: "insensitive" as const },
                    },
                  },
                },
              },
              {
                entries: {
                  some: {
                    work: {
                      authorName: { contains: q, mode: "insensitive" as const },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      entries: {
        include: {
          work: { select: { id: true, title: true, authorName: true } },
        },
        orderBy: { position: "asc" },
      },
      items: { orderBy: { position: "asc" } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: page * 20,
    take: 21,
  });
  return NextResponse.json({
    kits: kits.slice(0, 20),
    nextPage: kits.length > 20 ? page + 1 : null,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOriginJson(request))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid reading kit." },
      { status: 400 },
    );
  const { kitId, version, kit } = parsed.data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reading-kit:" + kitId}))`;
    const old = await tx.readingKit.findUnique({
      where: { id: kitId },
      include: {
        entries: { orderBy: { position: "asc" } },
        items: { orderBy: { position: "asc" } },
      },
    });
    if (old && old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Reading kit not found." },
        { status: 404 },
      );
    if (old?.deletedAt)
      return NextResponse.json(
        { error: "This reading kit was deleted. Reload before saving." },
        { status: 409 },
      );
    const same =
      !!old &&
      old.title === kit.title &&
      old.notes === kit.notes &&
      old.makeDo === kit.makeDo &&
      old.sensoryProfile === kit.sensoryProfile &&
      old.creatorEssay === kit.creatorEssay &&
      old.playlistUrl === kit.playlistUrl &&
      old.suggestedOrder === kit.suggestedOrder &&
      old.publicDescription === kit.publicDescription &&
      old.budgetTier === kit.budgetTier &&
      old.isPublic === kit.isPublic &&
      JSON.stringify(
        old.entries.map(({ workId, note }) => ({ workId, note })),
      ) === JSON.stringify(kit.entries) &&
      JSON.stringify(
        old.items.map(({ kind, title, details, externalUrl }) => ({
          kind,
          title,
          details,
          externalUrl,
        })),
      ) === JSON.stringify(kit.items);
    if (old && old.version !== version) {
      if (same && old.version === version + 1)
        return NextResponse.json({ kitId, version: old.version });
      return NextResponse.json(
        { error: "This reading kit changed elsewhere. Reload before saving." },
        { status: 409 },
      );
    }
    if (!old && version !== 0)
      return NextResponse.json(
        { error: "Reload before saving." },
        { status: 409 },
      );
    if (same) return NextResponse.json({ kitId, version: old!.version });
    const works = await tx.work.findMany({
      where: {
        id: { in: kit.entries.map((entry) => entry.workId) },
        editions: {
          some: { userBooks: { some: { userId: session.user.id } } },
        },
      },
      select: { id: true },
    });
    if (works.length !== kit.entries.length)
      return NextResponse.json(
        { error: "One or more books are not in your library." },
        { status: 409 },
      );
    if (old) {
      await tx.readingKitEntry.deleteMany({ where: { kitId } });
      await tx.readingKitItem.deleteMany({ where: { kitId } });
    }
    const data = {
      title: kit.title,
      notes: kit.notes,
      makeDo: kit.makeDo,
      sensoryProfile: kit.sensoryProfile,
      creatorEssay: kit.creatorEssay,
      playlistUrl: kit.playlistUrl,
      suggestedOrder: kit.suggestedOrder,
      publicDescription: kit.publicDescription,
      budgetTier: kit.budgetTier,
      isPublic: kit.isPublic,
      publishedAt: kit.isPublic ? (old?.publishedAt ?? new Date()) : null,
      entries: {
        create: kit.entries.map((entry, position) => ({ ...entry, position })),
      },
      items: {
        create: kit.items.map((item, position) => ({ ...item, position })),
      },
    };
    const saved = old
      ? await tx.readingKit.update({
          where: { id: kitId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.readingKit.create({
          data: { id: kitId, userId: session.user.id, ...data },
        });
    return NextResponse.json({ kitId, version: saved.version });
  });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOriginJson(request))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid deletion request." },
      { status: 400 },
    );
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reading-kit:" + parsed.data.kitId}))`;
    const old = await tx.readingKit.findUnique({
      where: { id: parsed.data.kitId },
    });
    if (!old || old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Reading kit not found." },
        { status: 404 },
      );
    if (old.deletedAt) return NextResponse.json({ deleted: true });
    if (old.version !== parsed.data.version)
      return NextResponse.json(
        {
          error: "This reading kit changed elsewhere. Reload before deleting.",
        },
        { status: 409 },
      );
    await tx.readingKitEntry.deleteMany({ where: { kitId: old.id } });
    await tx.readingKitItem.deleteMany({ where: { kitId: old.id } });
    await tx.readingKitSave.deleteMany({ where: { kitId: old.id } });
    await tx.readingKit.update({
      where: { id: old.id },
      data: {
        title: "",
        notes: "",
        makeDo: "",
        sensoryProfile: "",
        creatorEssay: "",
        playlistUrl: "",
        suggestedOrder: "",
        publicDescription: "",
        isPublic: false,
        publishedAt: null,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ deleted: true });
  });
}
