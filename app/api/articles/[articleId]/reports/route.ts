import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  publishedArticles,
  parseArticleContent,
  articleNodes,
} from "@/lib/articles";
export async function POST(
  request: Request,
  { params }: { params: { articleId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({
      publishedVersion: z.number().int().positive(),
      reason: z.enum(["spam", "harassment", "spoilers", "other"]),
      details: z.string().trim().max(2000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Choose a reason and keep details under 2,000 characters." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.article.findUnique({
      where: { id: params.articleId },
      select: { userId: true },
    });
    if (!target) return { status: 404, error: "Article not found." };
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${target.userId} FOR NO KEY UPDATE`;
    const article = await tx.article.findFirst({
      where: { id: params.articleId, ...publishedArticles },
    });
    if (!article) return { status: 404, error: "Article not found." };
    if (article.userId === session.user.id)
      return { status: 400, error: "You cannot report your own article." };
    if (article.publishedVersion !== parsed.data.publishedVersion)
      return {
        status: 409,
        error: "This article has changed. Reload it before reporting.",
      };
    const key = {
      articleId: article.id,
      reporterId: session.user.id,
      publishedVersion: parsed.data.publishedVersion,
    };
    const existing = await tx.articleReport.findUnique({
      where: { articleId_reporterId_publishedVersion: key },
      select: { id: true },
    });
    if (existing) return { status: 200 };
    const content = parseArticleContent(article.publishedContent);
    await tx.articleReport.create({
      data: {
        ...key,
        reason: parsed.data.reason,
        details: parsed.data.details,
        title: article.publishedTitle!,
        snapshot: content as Prisma.InputJsonValue,
        imageIds: articleNodes(content, "articleImage").map((n) =>
          String(n.attrs!.imageId),
        ),
      },
    });
    return { status: 201 };
  });
  return Response.json(result, { status: result.status });
}
