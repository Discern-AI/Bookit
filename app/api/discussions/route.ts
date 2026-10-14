import { discussionCommunity } from "@/lib/discussion-communities";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  discussionActionSchema,
  discussionSelect,
} from "@/lib/book-discussions";
import { z } from "zod";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  const p = new URL(request.url).searchParams,
    thread = p.get("thread"),
    workId = p.get("work"),
    authorName = p.get("author"),
    communityId = p.get("community"),
    page = Number(p.get("page") || 0);
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 100000 ||
    (thread && !z.string().uuid().safeParse(thread).success) ||
    (workId && workId.length > 100) ||
    (authorName !== null && (!authorName.trim() || authorName.length > 500)) ||
    (communityId !== null && !discussionCommunity(communityId))
  )
    return reply({ error: "Invalid discussion page." }, 400);
  const select = {
    ...discussionSelect,
    userId: true,
    work: { select: { title: true, authorName: true } },
  };
  const safe = <T extends { userId: string }>(v: T) => {
    const { userId, ...rest } = v;
    return { ...rest, own: userId === session.user.id };
  };
  if (thread) {
    const found = await prisma.bookDiscussion.findUnique({
      where: { id: thread },
      select: { workId: true },
    });
    if (!found) return reply({ error: "Discussion not found." }, 404);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"discussion:" + found.workId}))`;
      const root = await tx.bookDiscussion.findFirst({
        where: { id: thread, parentId: null, deletedAt: null },
        select,
      });
      if (!root) return reply({ error: "Discussion not found." }, 404);
      const posts = await tx.bookDiscussion.findMany({
        where: { parentId: thread, deletedAt: null },
        select,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: page * 20,
        take: 21,
      });
      return reply({
        thread: safe(root),
        posts: posts.slice(0, 20).map(safe),
        hasMore: posts.length > 20,
      });
    });
  }
  const [posts, book] = await Promise.all([
    prisma.bookDiscussion.findMany({
      where: {
        parentId: null,
        deletedAt: null,
        ...(workId ? { workId } : {}),
        ...(authorName ? { work: { authorName } } : {}),
        ...(communityId ? { communityId } : {}),
      },
      select: { ...select, body: false },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: page * 20,
      take: 21,
    }),
    workId
      ? prisma.work.findUnique({
          where: { id: workId },
          select: { id: true, title: true },
        })
      : null,
  ]);
  if (workId && !book) return reply({ error: "Book not found." }, 404);
  return reply({
    threads: posts.slice(0, 20).map(safe),
    book,
    hasMore: posts.length > 20,
  });
}
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const parsed = discussionActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply(
      {
        error:
          "Check the title, display name and message (up to 5,000 characters).",
      },
      400,
    );
  const d = parsed.data;
  const target =
    d.action === "post"
      ? null
      : await prisma.bookDiscussion.findUnique({
          where: { id: d.action === "report" ? d.postId : d.id },
          select: { workId: true },
        });
  const workId = d.action === "post" ? d.workId : target?.workId;
  if (!workId) return reply({ error: "Post not found." }, 404);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"discussion:" + workId}))`;
      const stale = () =>
        reply(
          {
            error:
              "This discussion changed elsewhere. Your draft is kept; reload before trying again.",
          },
          409,
        );
      if (d.action === "post") {
        if (
          !(await tx.work.findUnique({
            where: { id: workId },
            select: { id: true },
          }))
        )
          return reply({ error: "Book not found." }, 404);
        if (d.parentId) {
          const parent = await tx.bookDiscussion.findFirst({
            where: { id: d.parentId, workId, parentId: null, deletedAt: null },
          });
          if (!parent) return reply({ error: "Discussion not found." }, 404);
          if (
            parent.spoilers !== d.spoilers ||
            parent.communityId !== d.communityId
          )
            return stale();
        }
        const old = await tx.bookDiscussion.findUnique({ where: { id: d.id } });
        if (
          old &&
          (old.userId !== session.user.id ||
            old.workId !== workId ||
            old.parentId !== d.parentId)
        )
          return reply({ error: "Post not found." }, 404);
        if (
          old?.deletedAt ||
          (old &&
            (old.spoilers !== d.spoilers || old.communityId !== d.communityId))
        )
          return stale();
        const same =
          old &&
          old.title === d.title &&
          old.body === d.body &&
          old.alias === d.alias;
        if (old && old.version !== d.version)
          return same && old.version === d.version + 1
            ? reply({ id: old.parentId || old.id })
            : stale();
        if (!old && d.version !== 0) return stale();
        if (!old)
          await tx.bookDiscussion.create({
            data: {
              id: d.id,
              userId: session.user.id,
              workId,
              communityId: d.communityId,
              parentId: d.parentId,
              title: d.title,
              body: d.body,
              alias: d.alias,
              spoilers: d.spoilers,
            },
          });
        else if (!same)
          await tx.bookDiscussion.update({
            where: { id: old.id },
            data: {
              title: d.title,
              body: d.body,
              alias: d.alias,
              version: { increment: 1 },
            },
          });
        return reply({ id: d.parentId || d.id });
      }
      const post = await tx.bookDiscussion.findUnique({
        where: { id: d.action === "report" ? d.postId : d.id },
        include: { parent: { select: { deletedAt: true } } },
      });
      if (!post) return reply({ error: "Post not found." }, 404);
      if (d.action === "delete") {
        if (post.userId !== session.user.id)
          return reply({ error: "Post not found." }, 404);
        if (post.deletedAt) return reply({ ok: true });
        if (post.version !== d.version) return stale();
        await tx.bookDiscussion.updateMany({
          where: {
            OR: [
              { id: post.id },
              ...(!post.parentId ? [{ parentId: post.id }] : []),
            ],
          },
          data: {
            deletedAt: new Date(),
            body: "",
            title: "",
            alias: "",
            version: { increment: 1 },
          },
        });
        return reply({ ok: true });
      }
      if (post.deletedAt || post.parent?.deletedAt)
        return reply({ error: "Post not found." }, 404);
      const old = await tx.discussionReport.findUnique({ where: { id: d.id } });
      if (old)
        return old.userId === session.user.id && old.postId === post.id
          ? reply({ ok: true })
          : stale();
      const existing = await tx.discussionReport.findUnique({
        where: { postId_userId: { postId: post.id, userId: session.user.id } },
      });
      if (!existing)
        await tx.discussionReport.create({
          data: {
            id: d.id,
            postId: post.id,
            userId: session.user.id,
            reason: d.reason,
          },
        });
      return reply({ ok: true });
    });
  } catch {
    return reply(
      { error: "Could not save. Your draft is kept; try again." },
      503,
    );
  }
}
