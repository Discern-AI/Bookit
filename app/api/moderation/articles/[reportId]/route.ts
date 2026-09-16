import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function PATCH(
  request: Request,
  { params }: { params: { reportId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const input = z
    .object({
      action: z.enum(["hide", "dismiss", "restore"]),
      version: z.number().int().positive(),
      note: z.string().trim().min(5).max(2000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json(
      {
        error:
          "Provide the current article version and a decision note of 5-2,000 characters.",
      },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    const moderator = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { isModerator: true },
    });
    if (!moderator?.isModerator)
      return { status: 403, error: "Moderator access required." };
    const target = await tx.articleReport.findUnique({
      where: { id: params.reportId },
      select: { article: { select: { userId: true } } },
    });
    if (!target) return { status: 404, error: "Report not found." };
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${target.article.userId} FOR NO KEY UPDATE`;
    const report = await tx.articleReport.findUniqueOrThrow({
      where: { id: params.reportId },
      include: { article: true },
    });
    const article = report.article;
    const { action, version, note } = input.data;
    if (article.version !== version)
      return {
        status: 409,
        error: "The article changed. Reload the queue before deciding.",
      };
    if (action === "restore") {
      if (
        report.status !== "hidden" ||
        !article.isHidden ||
        article.deletedAt ||
        report.decisionVersion !== article.moderationVersion
      )
        return {
          status: 409,
          error:
            "This restriction is no longer current or the article was deleted.",
        };
      await tx.article.update({
        where: { id: article.id },
        data: {
          isHidden: false,
          isPublic: false,
          moderationVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await tx.articleReport.update({
        where: { id: report.id },
        data: {
          status: "restored",
          restoreNote: note,
          restoredAt: new Date(),
          restoredById: session.user.id,
        },
      });
    } else {
      if (report.status !== "pending")
        return { status: 409, error: "This report was already resolved." };
      if (action === "hide" && article.deletedAt)
        return {
          status: 409,
          error:
            "The article was deleted. You can dismiss its report with a note.",
        };
      if (action === "hide")
        await tx.article.update({
          where: { id: article.id },
          data: {
            isHidden: true,
            moderationVersion: { increment: 1 },
            version: { increment: 1 },
          },
        });
      await tx.articleReport.update({
        where: { id: report.id },
        data: {
          status: action === "hide" ? "hidden" : "dismissed",
          decisionVersion:
            action === "hide" ? article.moderationVersion + 1 : null,
          note,
          resolvedAt: new Date(),
          resolvedById: session.user.id,
        },
      });
    }
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
