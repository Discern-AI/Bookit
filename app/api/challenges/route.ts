import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import { challengeSchema, squareSchema } from "@/lib/challenges";
import { readingChallenges } from "@/lib/challenge-progress";
import { z } from "zod";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  const [challenges, books] = await Promise.all([
    readingChallenges(session.user.id),
    prisma.userBook.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        edition: {
          select: {
            workId: true,
            work: { select: { title: true, authorName: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const choices = [
    ...new Map(
      books.map((b) => [
        b.edition.workId,
        {
          workId: b.edition.workId,
          userBookId: b.id,
          title: b.edition.work.title,
          author: b.edition.work.authorName,
        },
      ]),
    ).values(),
  ];
  return reply({ challenges, choices });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = challengeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return reply(
      {
        error:
          "Check the title, target and dates. Bingo boards need nine non-empty prompts.",
      },
      400,
    );
  const d = { ...input.data, genre: input.data.genre || null };
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const old = await tx.readingChallenge.findUnique({
        where: { id: d.id },
        include: { squares: { orderBy: { position: "asc" } } },
      });
      if (old)
        return old.userId === session.user.id &&
          !old.deletedAt &&
          old.title === d.title &&
          old.target === d.target &&
          old.startsOn === d.startsOn &&
          old.endsOn === d.endsOn &&
          old.genre === d.genre &&
          old.kind === d.kind &&
          (d.kind !== "bingo" ||
            JSON.stringify(old.squares.map((s) => s.prompt)) ===
              JSON.stringify(d.prompts))
          ? reply({ ok: true })
          : reply(
              {
                error:
                  "This request has already changed. Reload before creating another challenge.",
              },
              409,
            );
      await tx.readingChallenge.create({
        data: {
          id: d.id,
          title: d.title,
          target: d.target,
          startsOn: d.startsOn,
          endsOn: d.endsOn,
          genre: d.genre,
          kind: d.kind,
          userId: session.user.id,
          squares: d.prompts
            ? {
                create: d.prompts.map((prompt, position) => ({
                  prompt,
                  position,
                })),
              }
            : undefined,
        },
      });
      return reply({ ok: true }, 201);
    });
  } catch {
    return reply(
      { error: "Could not save. Your draft is kept; try again." },
      503,
    );
  }
}
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = z
    .object({ id: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ error: "Invalid challenge." }, 400);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"challenge:" + input.data.id}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const result = await tx.readingChallenge.updateMany({
      where: { id: input.data.id, userId: session.user.id },
      data: {
        deletedAt: new Date(),
        isPublic: false,
        shareVersion: { increment: 1 },
      },
    });
    if (result.count)
      await tx.charityCampaign.deleteMany({
        where: { challengeId: input.data.id },
      });
    return result.count
      ? reply({ ok: true })
      : reply({ error: "Challenge not found." }, 404);
  });
}
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = squareSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ error: "Invalid square selection." }, 400);
  const d = input.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const challenge = await tx.readingChallenge.findFirst({
        where: {
          id: d.id,
          userId: session.user.id,
          deletedAt: null,
          kind: "bingo",
        },
        include: { squares: true },
      });
      const square = challenge?.squares.find((s) => s.id === d.squareId);
      if (!challenge || !square)
        return reply({ error: "Challenge square not found." }, 404);
      if (square.version !== d.version) {
        if (square.version === d.version + 1 && square.workId === d.workId)
          return reply({ ok: true });
        return reply(
          {
            error:
              "This square changed elsewhere. Your selection is kept. Reload the board before trying again.",
          },
          409,
        );
      }
      if (d.workId) {
        if (
          !(await tx.userBook.findFirst({
            where: { userId: session.user.id, edition: { workId: d.workId } },
            select: { id: true },
          }))
        )
          return reply({ error: "Choose a book from your own library." }, 404);
        if (
          challenge.squares.some(
            (s) => s.id !== d.squareId && s.workId === d.workId,
          )
        )
          return reply(
            {
              error:
                "This book already fills another square. Choose a different book.",
            },
            409,
          );
      }
      if (square.workId !== d.workId)
        await tx.challengeSquare.update({
          where: { id: square.id },
          data: { workId: d.workId, version: { increment: 1 } },
        });
      return reply({ ok: true });
    });
  } catch {
    return reply(
      { error: "Could not save your selection. Please retry." },
      503,
    );
  }
}
