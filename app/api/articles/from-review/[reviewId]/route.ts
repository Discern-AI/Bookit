import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { reviewArticleContent } from "@/lib/review-article";
export async function POST(
  request: Request,
  { params }: { params: { reviewId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({ version: z.number().int().positive() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Provide the saved review version." },
      { status: 400 },
    );
  const userId = session.user.id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const review = await tx.bookReview.findFirst({
      where: { id: params.reviewId, userId, active: true, deletedAt: null },
      select: {
        id: true,
        version: true,
        isHidden: true,
        body: true,
        work: { select: { title: true } },
      },
    });
    if (!review) return { status: 404, error: "Review not found." };
    if (review.isHidden)
      return {
        status: 403,
        error:
          "Appeal the review restriction before turning it into an article.",
      };
    if (review.version !== parsed.data.version)
      return {
        status: 409,
        error: "The review changed. Reload before creating an article.",
      };
    const key = {
      userId,
      sourceReviewId: review.id,
      sourceReviewVersion: review.version,
    };
    const existing = await tx.article.findUnique({
      where: { userId_sourceReviewId_sourceReviewVersion: key },
      select: { id: true, deletedAt: true },
    });
    if (existing)
      return existing.deletedAt
        ? {
            status: 409,
            error:
              "The article created from this review version was deleted. Start a new article or revise your review first.",
          }
        : { status: 200, id: existing.id };
    let content;
    try {
      content = reviewArticleContent(review.body);
    } catch {
      return {
        status: 400,
        error: "Save a review with some text before creating an article.",
      };
    }
    const article = await tx.article.create({
      data: {
        id: randomUUID(),
        ...key,
        title: `Reflections on ${review.work.title}`.slice(0, 160),
        content: content as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { status: 201, id: article.id };
  });
  return Response.json(result, { status: result.status });
}
