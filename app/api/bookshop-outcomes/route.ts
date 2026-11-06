import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { bookshopOutcomeSchema } from "@/lib/bookshop-outcome";
import { prisma } from "@/lib/prisma";

const saveSchema = z.object({
  outcomeId: z.string().uuid(),
  version: z.number().int().min(0),
  outcome: bookshopOutcomeSchema,
});
const deleteSchema = z.object({
  outcomeId: z.string().uuid(),
  version: z.number().int().positive(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const outcomes = await prisma.bookshopOutcome.findMany({
    where: { userId: session.user.id, deletedAt: null },
    include: {
      work: { select: { id: true, title: true, authorName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 50,
  });
  return NextResponse.json({ outcomes });
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
      { error: parsed.error.issues[0]?.message || "Invalid outcome." },
      { status: 400 },
    );
  const { outcomeId, version, outcome } = parsed.data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"bookshop-outcome:" + outcomeId}))`;
    const old = await tx.bookshopOutcome.findUnique({
      where: { id: outcomeId },
    });
    if (old && old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Outcome not found." },
        { status: 404 },
      );
    if (old?.deletedAt)
      return NextResponse.json(
        { error: "This outcome was deleted. Reload before saving." },
        { status: 409 },
      );
    const visitedAt = outcome.visitedAt ? new Date(outcome.visitedAt) : null;
    const same =
      !!old &&
      old.workId === outcome.workId &&
      old.shopName === outcome.shopName &&
      old.outcome === outcome.outcome &&
      old.notes === outcome.notes &&
      old.externalUrl === "" &&
      old.visitedAt?.getTime() === visitedAt?.getTime();
    if (old && old.version !== version) {
      if (same && old.version === version + 1)
        return NextResponse.json({ outcomeId, version: old.version });
      return NextResponse.json(
        { error: "This outcome changed elsewhere. Reload before saving." },
        { status: 409 },
      );
    }
    if (!old && version !== 0)
      return NextResponse.json(
        { error: "Reload before saving." },
        { status: 409 },
      );
    if (same) return NextResponse.json({ outcomeId, version: old!.version });
    if (outcome.workId) {
      const owned = await tx.work.findFirst({
        where: {
          id: outcome.workId,
          editions: {
            some: { userBooks: { some: { userId: session.user.id } } },
          },
        },
        select: { id: true },
      });
      if (!owned)
        return NextResponse.json(
          { error: "That book is not in your library." },
          { status: 409 },
        );
    }
    const data = {
      workId: outcome.workId,
      shopName: outcome.shopName,
      outcome: outcome.outcome,
      notes: outcome.notes,
      // Coordinates are used only in the browser tab and never persisted.
      externalUrl: "",
      visitedAt,
    };
    const saved = old
      ? await tx.bookshopOutcome.update({
          where: { id: outcomeId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.bookshopOutcome.create({
          data: { id: outcomeId, userId: session.user.id, ...data },
        });
    return NextResponse.json({ outcomeId, version: saved.version });
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"bookshop-outcome:" + parsed.data.outcomeId}))`;
    const old = await tx.bookshopOutcome.findUnique({
      where: { id: parsed.data.outcomeId },
    });
    if (!old || old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Outcome not found." },
        { status: 404 },
      );
    if (old.deletedAt) return NextResponse.json({ deleted: true });
    if (old.version !== parsed.data.version)
      return NextResponse.json(
        { error: "This outcome changed elsewhere. Reload before deleting." },
        { status: 409 },
      );
    await tx.bookshopOutcome.update({
      where: { id: old.id },
      data: {
        workId: null,
        shopName: "",
        notes: "",
        externalUrl: "",
        visitedAt: null,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ deleted: true });
  });
}
