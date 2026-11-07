import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { prisma } from "@/lib/prisma";
import { readingAfternoonSchema } from "@/lib/reading-afternoon";

const saveSchema = z.object({
  afternoonId: z.string().uuid(),
  version: z.number().int().min(0),
  afternoon: readingAfternoonSchema,
});
const deleteSchema = z.object({
  afternoonId: z.string().uuid(),
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
      { error: "Invalid reading afternoon search." },
      { status: 400 },
    );
  const afternoons = await prisma.readingAfternoon.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { place: { contains: q, mode: "insensitive" as const } },
              { weather: { contains: q, mode: "insensitive" as const } },
              { notes: { contains: q, mode: "insensitive" as const } },
              {
                work: {
                  is: { title: { contains: q, mode: "insensitive" as const } },
                },
              },
              {
                work: {
                  is: {
                    authorName: { contains: q, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      work: { select: { id: true, title: true, authorName: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    skip: page * 20,
    take: 21,
  });
  return NextResponse.json({
    afternoons: afternoons.slice(0, 20),
    nextPage: afternoons.length > 20 ? page + 1 : null,
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
      {
        error: parsed.error.issues[0]?.message || "Invalid reading afternoon.",
      },
      { status: 400 },
    );
  const { afternoonId, version, afternoon } = parsed.data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reading-afternoon:" + afternoonId}))`;
    const old = await tx.readingAfternoon.findUnique({
      where: { id: afternoonId },
    });
    if (old && old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Reading afternoon not found." },
        { status: 404 },
      );
    if (old?.deletedAt)
      return NextResponse.json(
        { error: "This reading afternoon was deleted. Reload before saving." },
        { status: 409 },
      );
    const date = new Date(afternoon.date);
    const same =
      !!old &&
      old.date.getTime() === date.getTime() &&
      old.durationMinutes === afternoon.durationMinutes &&
      old.place === afternoon.place &&
      old.weather === afternoon.weather &&
      old.pace === afternoon.pace &&
      old.workId === afternoon.workId &&
      old.kitId === afternoon.kitId &&
      old.notes === afternoon.notes &&
      old.status === afternoon.status;
    if (old && old.version !== version) {
      if (same && old.version === version + 1)
        return NextResponse.json({ afternoonId, version: old.version });
      return NextResponse.json(
        {
          error:
            "This reading afternoon changed elsewhere. Reload before saving.",
        },
        { status: 409 },
      );
    }
    if (!old && version !== 0)
      return NextResponse.json(
        { error: "Reload before saving." },
        { status: 409 },
      );
    if (same) return NextResponse.json({ afternoonId, version: old!.version });
    if (afternoon.workId) {
      const work = await tx.work.findFirst({
        where: {
          id: afternoon.workId,
          editions: {
            some: { userBooks: { some: { userId: session.user.id } } },
          },
        },
        select: { id: true },
      });
      if (!work)
        return NextResponse.json(
          { error: "That book is not in your library." },
          { status: 409 },
        );
    }
    if (afternoon.kitId) {
      const kit = await tx.readingKit.findFirst({
        where: {
          id: afternoon.kitId,
          userId: session.user.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!kit)
        return NextResponse.json(
          { error: "That reading kit is not available." },
          { status: 409 },
        );
    }
    const data = {
      workId: afternoon.workId,
      kitId: afternoon.kitId,
      date,
      durationMinutes: afternoon.durationMinutes,
      place: afternoon.place,
      weather: afternoon.weather,
      pace: afternoon.pace,
      notes: afternoon.notes,
      status: afternoon.status,
    };
    const saved = old
      ? await tx.readingAfternoon.update({
          where: { id: afternoonId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.readingAfternoon.create({
          data: { id: afternoonId, userId: session.user.id, ...data },
        });
    return NextResponse.json({ afternoonId, version: saved.version });
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
      { error: "Invalid cancellation request." },
      { status: 400 },
    );
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reading-afternoon:" + parsed.data.afternoonId}))`;
    const old = await tx.readingAfternoon.findUnique({
      where: { id: parsed.data.afternoonId },
    });
    if (!old || old.userId !== session.user.id)
      return NextResponse.json(
        { error: "Reading afternoon not found." },
        { status: 404 },
      );
    if (old.deletedAt) return NextResponse.json({ deleted: true });
    if (old.version !== parsed.data.version)
      return NextResponse.json(
        {
          error:
            "This reading afternoon changed elsewhere. Reload before cancelling.",
        },
        { status: 409 },
      );
    await tx.readingAfternoon.update({
      where: { id: old.id },
      data: {
        workId: null,
        kitId: null,
        place: "home",
        weather: "indoors",
        pace: "steady",
        notes: "",
        status: "cancelled",
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ deleted: true });
  });
}
