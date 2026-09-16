import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function PATCH(
  request: Request,
  { params }: { params: { appealId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({
      action: z.enum(["restore", "reject"]),
      version: z.number().int().positive(),
      response: z.string().trim().min(10).max(2000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Provide the current article version and a response of 10-2,000 characters.",
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
    const target = await tx.articleAppeal.findUnique({
      where: { id: params.appealId },
      select: { article: { select: { userId: true } } },
    });
    if (!target) return { status: 404, error: "Appeal not found." };
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${target.article.userId} FOR NO KEY UPDATE`;
    const appeal = await tx.articleAppeal.findUniqueOrThrow({
      where: { id: params.appealId },
      include: { article: true },
    });
    const article = appeal.article;
    if (
      appeal.status !== "pending" ||
      article.deletedAt ||
      !article.isHidden ||
      article.version !== parsed.data.version ||
      article.moderationVersion !== appeal.moderationVersion
    )
      return {
        status: 409,
        error:
          "The appeal, article or restriction changed. Reload before deciding.",
      };
    const { action, response } = parsed.data;
    if (action === "restore") {
      await tx.article.update({
        where: { id: article.id },
        data: {
          isHidden: false,
          isPublic: false,
          moderationVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await tx.articleReport.updateMany({
        where: {
          articleId: article.id,
          status: "hidden",
          decisionVersion: appeal.moderationVersion,
        },
        data: {
          status: "restored",
          restoreNote: response,
          restoredAt: new Date(),
          restoredById: session.user.id,
        },
      });
    }
    await tx.articleAppeal.update({
      where: { id: appeal.id },
      data: {
        status: action === "restore" ? "restored" : "rejected",
        response,
        resolvedAt: new Date(),
        resolvedById: session.user.id,
      },
    });
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
