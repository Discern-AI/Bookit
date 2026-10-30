import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bookshopOutcomeSchema, safeExternalMapUrl } from "@/lib/bookshop-outcome";

export async function GET() {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const outcomes = await prisma.bookshopOutcome.findMany({ where: { userId: session.user.id, deletedAt: null }, include: { work: { select: { id: true, title: true, authorName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50 });
  return NextResponse.json({ outcomes });
}

export async function POST(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = bookshopOutcomeSchema.safeParse(body?.outcome); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid outcome." }, { status: 400 });
  if (parsed.data.workId) {
    const owned = await prisma.work.findFirst({ where: { id: parsed.data.workId, editions: { some: { userBooks: { some: { userId: session.user.id } } } } }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "That book is not in your library." }, { status: 409 });
  }
  const externalUrl = parsed.data.externalUrl ? safeExternalMapUrl(parsed.data.externalUrl) : null;
  if (parsed.data.externalUrl && !externalUrl) return NextResponse.json({ error: "Only Google Maps links can be saved." }, { status: 400 });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof body.outcomeId === "string" && !uuid.test(body.outcomeId)) return NextResponse.json({ error: "Invalid outcome identity." }, { status: 400 });
  const id = typeof body.outcomeId === "string" ? body.outcomeId : randomUUID();
  if (typeof body.outcomeId === "string") {
    if (!await prisma.bookshopOutcome.findFirst({ where: { id, userId: session.user.id, deletedAt: null }, select: { id: true } })) return NextResponse.json({ error: "Outcome not found." }, { status: 404 });
  }
  await prisma.bookshopOutcome.upsert({ where: { id }, create: { id, userId: session.user.id, workId: parsed.data.workId, shopName: parsed.data.shopName, outcome: parsed.data.outcome, notes: parsed.data.notes, externalUrl: externalUrl ?? "", visitedAt: parsed.data.visitedAt ? new Date(parsed.data.visitedAt) : null }, update: { workId: parsed.data.workId, shopName: parsed.data.shopName, outcome: parsed.data.outcome, notes: parsed.data.notes, externalUrl: externalUrl ?? "", visitedAt: parsed.data.visitedAt ? new Date(parsed.data.visitedAt) : null } });
  return NextResponse.json({ outcomeId: id });
}

export async function DELETE(request: Request) {
  const session = await auth(); if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("outcomeId") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Invalid outcome identity." }, { status: 400 });
  const result = await prisma.bookshopOutcome.updateMany({ where: { id, userId: session.user.id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!result.count) return NextResponse.json({ error: "Outcome not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
