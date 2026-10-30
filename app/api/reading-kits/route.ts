import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readingKitSchema } from "@/lib/reading-kit";

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kits = await prisma.readingKit.findMany({
    where: { userId: session.user.id, deletedAt: null },
    include: { entries: { include: { work: { select: { id: true, title: true, authorName: true } } }, orderBy: { position: "asc" } } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 50,
  });
  return NextResponse.json({ kits });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = readingKitSchema.safeParse(body?.kit);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid reading kit." }, { status: 400 });
  if (body?.kitId !== undefined && (typeof body.kitId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.kitId)))
    return NextResponse.json({ error: "Invalid kit identity." }, { status: 400 });
  const works = await prisma.work.findMany({
    where: {
      id: { in: parsed.data.entries.map((entry) => entry.workId) },
      editions: { some: { userBooks: { some: { userId: session.user.id } } } },
    },
    select: { id: true },
  });
  if (works.length !== parsed.data.entries.length)
    return NextResponse.json({ error: "One or more books no longer exist." }, { status: 409 });
  const kitId = typeof body.kitId === "string" ? body.kitId : randomUUID();
  if (typeof body.kitId === "string") {
    const existing = await prisma.readingKit.findFirst({ where: { id: kitId, userId: session.user.id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Reading kit not found." }, { status: 404 });
  }
  await prisma.$transaction(async (db) => {
    await db.readingKit.upsert({
      where: { id: kitId },
      create: { id: kitId, userId: session.user.id, title: parsed.data.title, notes: parsed.data.notes, makeDo: parsed.data.makeDo, sensoryProfile: parsed.data.sensoryProfile, budgetTier: parsed.data.budgetTier, isPublic: parsed.data.isPublic },
      update: { title: parsed.data.title, notes: parsed.data.notes, makeDo: parsed.data.makeDo, sensoryProfile: parsed.data.sensoryProfile, budgetTier: parsed.data.budgetTier, isPublic: parsed.data.isPublic, version: { increment: 1 } },
    });
    await db.readingKitEntry.deleteMany({ where: { kitId } });
    await db.readingKitEntry.createMany({ data: parsed.data.entries.map((entry, position) => ({ kitId, workId: entry.workId, position, note: entry.note })) });
  });
  return NextResponse.json({ kitId });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kitId = new URL(request.url).searchParams.get("kitId") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(kitId))
    return NextResponse.json({ error: "Invalid kit identity." }, { status: 400 });
  const result = await prisma.readingKit.updateMany({ where: { id: kitId, userId: session.user.id, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } });
  if (!result.count) return NextResponse.json({ error: "Reading kit not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
