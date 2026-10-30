import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readingAfternoonSchema } from "@/lib/reading-afternoon";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const afternoons = await prisma.readingAfternoon.findMany({ where: { userId: session.user.id, deletedAt: null }, include: { work: { select: { id: true, title: true, authorName: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 50 });
  return NextResponse.json({ afternoons });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = readingAfternoonSchema.safeParse(body?.afternoon);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid reading afternoon." }, { status: 400 });
  if (parsed.data.workId) {
    const work = await prisma.work.findFirst({ where: { id: parsed.data.workId, editions: { some: { userBooks: { some: { userId: session.user.id } } } } }, select: { id: true } });
    if (!work) return NextResponse.json({ error: "That book is not in your library." }, { status: 409 });
  }
  if (parsed.data.kitId) {
    const kit = await prisma.readingKit.findFirst({ where: { id: parsed.data.kitId, userId: session.user.id, deletedAt: null }, select: { id: true } });
    if (!kit) return NextResponse.json({ error: "That reading kit is not available." }, { status: 409 });
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof body.afternoonId === "string" && !uuid.test(body.afternoonId)) return NextResponse.json({ error: "Invalid afternoon identity." }, { status: 400 });
  const id = typeof body.afternoonId === "string" ? body.afternoonId : randomUUID();
  if (typeof body.afternoonId === "string") {
    const owner = await prisma.readingAfternoon.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true } });
    if (!owner) return NextResponse.json({ error: "Reading afternoon not found." }, { status: 404 });
  }
  const data = { userId: session.user.id, workId: parsed.data.workId, kitId: parsed.data.kitId, date: new Date(parsed.data.date), durationMinutes: parsed.data.durationMinutes, place: parsed.data.place, weather: parsed.data.weather, pace: parsed.data.pace, notes: parsed.data.notes, status: parsed.data.status };
  await prisma.readingAfternoon.upsert({ where: { id }, create: { id, ...data }, update: data });
  return NextResponse.json({ afternoonId: id });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("afternoonId") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Invalid afternoon identity." }, { status: 400 });
  const result = await prisma.readingAfternoon.updateMany({ where: { id, userId: session.user.id, deletedAt: null }, data: { deletedAt: new Date(), status: "cancelled" } });
  if (!result.count) return NextResponse.json({ error: "Reading afternoon not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
