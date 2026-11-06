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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kits = await prisma.readingKit.findMany({
    where: { userId: session.user.id, deletedAt: null },
    include: {
      entries: {
        include: {
          work: { select: { id: true, title: true, authorName: true } },
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 50,
  });
  return NextResponse.json({ kits });
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
      include: { entries: { orderBy: { position: "asc" } } },
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
      old.budgetTier === kit.budgetTier &&
      old.isPublic === false &&
      JSON.stringify(
        old.entries.map(({ workId, note }) => ({ workId, note })),
      ) === JSON.stringify(kit.entries);
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
    if (old) await tx.readingKitEntry.deleteMany({ where: { kitId } });
    const data = {
      title: kit.title,
      notes: kit.notes,
      makeDo: kit.makeDo,
      sensoryProfile: kit.sensoryProfile,
      budgetTier: kit.budgetTier,
      isPublic: false,
      entries: {
        create: kit.entries.map((entry, position) => ({ ...entry, position })),
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
    await tx.readingKit.update({
      where: { id: old.id },
      data: {
        title: "",
        notes: "",
        makeDo: "",
        sensoryProfile: "",
        isPublic: false,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ deleted: true });
  });
}
