import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  discussionModerationSchema,
  discussionSelect,
} from "@/lib/book-discussions";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function moderator() {
  const s = await auth();
  return s?.user.id
    ? prisma.user.findFirst({
        where: { id: s.user.id, isModerator: true },
        select: { id: true },
      })
    : null;
}
export async function GET(request: Request) {
  if (!(await moderator()))
    return reply({ error: "Moderator access required." }, 403);
  const page = Number(new URL(request.url).searchParams.get("page") || 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
    return reply({ error: "Invalid page." }, 400);
  const reports = await prisma.discussionReport.findMany({
    where: { status: "pending" },
    select: {
      id: true,
      reason: true,
      post: {
        select: {
          ...discussionSelect,
          deletedAt: true,
          work: { select: { title: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: page * 20,
    take: 21,
  });
  return reply({ reports: reports.slice(0, 20), hasMore: reports.length > 20 });
}
export async function PATCH(request: Request) {
  if (!(await moderator()))
    return reply({ error: "Moderator access required." }, 403);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const parsed = discussionModerationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply({ error: "Invalid moderation action." }, 400);
  const d = parsed.data;
  const found = await prisma.discussionReport.findUnique({
    where: { id: d.id },
    select: { post: { select: { workId: true } } },
  });
  if (!found) return reply({ error: "Report not found." }, 404);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"discussion:" + found.post.workId}))`;
    const report = await tx.discussionReport.findUnique({
      where: { id: d.id },
      include: { post: true },
    });
    if (!report) return reply({ error: "Report not found." }, 404);
    if (report.status !== "pending")
      return report.status === d.decision
        ? reply({ ok: true })
        : reply({ error: "Report already resolved. Reload." }, 409);
    if (d.decision === "remove") {
      if (report.post.version !== d.version)
        return reply(
          { error: "Post changed since review. Reload and review it again." },
          409,
        );
      await tx.bookDiscussion.updateMany({
        where: {
          OR: [
            { id: report.postId },
            ...(!report.post.parentId ? [{ parentId: report.postId }] : []),
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
    }
    await tx.discussionReport.update({
      where: { id: d.id },
      data: { status: d.decision },
    });
    return reply({ ok: true });
  });
}
