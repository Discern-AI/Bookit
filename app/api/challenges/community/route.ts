import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  shareChallengeSchema,
  joinChallengeSchema,
  publicChallengeSelect,
} from "@/lib/community-challenges";
import { z } from "zod";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  const url = new URL(request.url),
    id = url.searchParams.get("id"),
    page = Number(url.searchParams.get("page") || 0);
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 100000 ||
    (id && !z.string().uuid().safeParse(id).success)
  )
    return reply({ error: "Invalid challenge page." }, 400);
  const templates = await prisma.readingChallenge.findMany({
    where: {
      isPublic: true,
      deletedAt: null,
      isCommunityCopy: false,
      ...(id ? { id } : {}),
    },
    select: publicChallengeSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: id ? 0 : page * 20,
    take: 21,
  });
  if (id && !templates.length)
    return reply({ error: "This challenge is no longer shared." }, 404);
  const own = await prisma.readingChallenge.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
      OR: [
        { sourceId: { in: templates.map((t) => t.id) } },
        { id: { in: templates.map((t) => t.id) } },
      ],
    },
    select: { id: true, sourceId: true },
  });
  return reply({
    templates: templates
      .slice(0, 20)
      .map((t) => ({
        ...t,
        joinedId:
          own.find((c) => c.sourceId === t.id || c.id === t.id)?.id || null,
      })),
    hasMore: templates.length > 20,
  });
}
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = shareChallengeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) return reply({ error: "Invalid sharing request." }, 400);
  const d = input.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"challenge:" + d.id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const c = await tx.readingChallenge.findFirst({
        where: {
          id: d.id,
          userId: session.user.id,
          deletedAt: null,
          isCommunityCopy: false,
        },
      });
      if (!c) return reply({ error: "Challenge not found." }, 404);
      if (c.shareVersion !== d.version) {
        if (c.shareVersion === d.version + 1 && c.isPublic === d.isPublic)
          return reply({ ok: true });
        return reply(
          { error: "Sharing changed elsewhere. Reload before trying again." },
          409,
        );
      }
      if (c.isPublic !== d.isPublic)
        await tx.readingChallenge.update({
          where: { id: c.id },
          data: { isPublic: d.isPublic, shareVersion: { increment: 1 } },
        });
      return reply({ ok: true });
    });
  } catch {
    return reply({ error: "Could not update sharing. Please retry." }, 503);
  }
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = joinChallengeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) return reply({ error: "Invalid join request." }, 400);
  const d = input.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"challenge:" + d.sourceId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const source = await tx.readingChallenge.findFirst({
        where: {
          id: d.sourceId,
          isPublic: true,
          deletedAt: null,
          isCommunityCopy: false,
        },
        include: { squares: { orderBy: { position: "asc" } } },
      });
      if (!source)
        return reply({ error: "This challenge is no longer shared." }, 404);
      if (source.shareVersion !== d.version)
        return reply(
          { error: "This shared challenge changed. Reload before joining." },
          409,
        );
      const old = await tx.readingChallenge.findUnique({ where: { id: d.id } });
      if (old)
        return old.userId === session.user.id &&
          old.sourceId === source.id &&
          !old.deletedAt
          ? reply({ id: old.id })
          : reply(
              {
                error:
                  "That join request is no longer valid. Reload to join again.",
              },
              409,
            );
      const joined = await tx.readingChallenge.findFirst({
        where: {
          userId: session.user.id,
          deletedAt: null,
          OR: [{ sourceId: source.id }, { id: source.id }],
        },
      });
      if (joined) return reply({ id: joined.id });
      const created = await tx.readingChallenge.create({
        data: {
          id: d.id,
          userId: session.user.id,
          sourceId: source.id,
          isCommunityCopy: true,
          title: source.title,
          kind: source.kind,
          target: source.target,
          startsOn: source.startsOn,
          endsOn: source.endsOn,
          genre: source.genre,
          squares:
            source.kind === "bingo"
              ? {
                  create: source.squares.map((s) => ({
                    position: s.position,
                    prompt: s.prompt,
                  })),
                }
              : undefined,
        },
      });
      return reply({ id: created.id }, 201);
    });
  } catch {
    return reply({ error: "Could not join. Please retry." }, 503);
  }
}
