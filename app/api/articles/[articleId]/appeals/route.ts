import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { parseArticleContent, articleNodes } from "@/lib/articles";
export async function POST(
  request: Request,
  { params }: { params: { articleId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const input = z
    .object({
      moderationVersion: z.number().int().min(0),
      reason: z.string().trim().min(10).max(2000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json(
      { error: "Explain your appeal in 10-2,000 characters." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR NO KEY UPDATE`;
    const article = await tx.article.findFirst({
      where: {
        id: params.articleId,
        userId: session.user.id,
        deletedAt: null,
        isHidden: true,
      },
    });
    if (!article || !article.publishedContent)
      return { status: 404, error: "No hidden published article to appeal." };
    if (article.moderationVersion !== input.data.moderationVersion)
      return {
        status: 409,
        error: "The moderation decision changed. Reload before appealing.",
      };
    const key = {
      articleId: article.id,
      moderationVersion: article.moderationVersion,
    };
    const existing = await tx.articleAppeal.findUnique({
      where: { articleId_moderationVersion: key },
    });
    if (existing)
      return existing.status === "pending" &&
        existing.reason === input.data.reason
        ? { status: 200 }
        : {
            status: 409,
            error:
              "An appeal already exists for this decision. Check Your article appeals.",
          };
    const snapshot = parseArticleContent(article.publishedContent);
    await tx.articleAppeal.create({
      data: {
        ...key,
        reason: input.data.reason,
        title: article.publishedTitle ?? "Article",
        snapshot: snapshot as Prisma.InputJsonValue,
        imageIds: articleNodes(snapshot, "articleImage").map((n) =>
          String(n.attrs!.imageId),
        ),
      },
    });
    return { status: 201 };
  });
  return Response.json(result, { status: result.status });
}
