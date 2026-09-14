import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { publishedReviews, commentSchema, reportSchema } from "@/lib/community";
async function mutate(
  request: Request,
  reviewId: string,
  action: "like" | "unlike" | "comment" | "report",
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const userId = session.user.id;
  const body =
    action === "comment" || action === "report"
      ? await request.json().catch(() => null)
      : null;
  const comment = action === "comment" ? commentSchema.safeParse(body) : null;
  const report = action === "report" ? reportSchema.safeParse(body) : null;
  if ((comment && !comment.success) || (report && !report.success))
    return Response.json(
      {
        error:
          "Check your input. Comments must contain 1-2,000 characters; report details can contain up to 2,000.",
      },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    // Match review editing lock order and serialize the commenter's profile visibility.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "BookReview" WHERE id = ${reviewId} FOR NO KEY UPDATE`;
    // Removing your own reaction remains possible after a review is hidden.
    if (action === "unlike") {
      await tx.reviewLike.deleteMany({ where: { userId, reviewId } });
      return { status: 200, liked: false };
    }
    const review = await tx.bookReview.findFirst({
      where: { id: reviewId, ...publishedReviews },
      select: { id: true, body: true },
    });
    if (!review)
      return { status: 404, error: "This review is no longer public." };
    if (action === "like") {
      await tx.reviewLike.upsert({
        where: { userId_reviewId: { userId, reviewId } },
        create: { userId, reviewId },
        update: {},
      });
      return { status: 200, liked: true };
    }
    if (comment?.success) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { profilePublic: true },
      });
      if (!user.profilePublic)
        return {
          status: 403,
          error: "Publish your profile before posting a public comment.",
        };
      const existing = await tx.reviewComment.findUnique({
        where: { id: comment.data.id },
      });
      if (existing) {
        if (
          existing.userId !== userId ||
          existing.reviewId !== reviewId ||
          existing.body !== comment.data.body ||
          existing.isHidden
        )
          return {
            status: 409,
            error:
              "That comment request has already been used. Reload before posting.",
          };
        return { status: 200 };
      }
      await tx.reviewComment.create({
        data: { ...comment.data, userId, reviewId },
      });
      return { status: 201 };
    }
    if (report?.success) {
      const data = report.data;
      let snapshot = review.body;
      if (data.commentId) {
        const target = await tx.reviewComment.findFirst({
          where: {
            id: data.commentId,
            reviewId,
            isHidden: false,
            user: { profilePublic: true },
          },
          select: { id: true, body: true },
        });
        if (!target) return { status: 404, error: "Comment not found." };
        snapshot = target.body;
      }
      const targetKey = data.commentId
        ? `comment:${data.commentId}`
        : `review:${reviewId}`;
      await tx.reviewReport.upsert({
        where: { reporterId_targetKey: { reporterId: userId, targetKey } },
        create: { reporterId: userId, reviewId, targetKey, snapshot, ...data },
        update: {},
      });
      return { status: 200 };
    }
    return { status: 400, error: "Invalid action." };
  });
  return Response.json(result, { status: result.status });
}
export async function PUT(
  request: Request,
  { params }: { params: { reviewId: string } },
) {
  return mutate(request, params.reviewId, "like");
}
export async function DELETE(
  request: Request,
  { params }: { params: { reviewId: string } },
) {
  return mutate(request, params.reviewId, "unlike");
}
export async function POST(
  request: Request,
  { params }: { params: { reviewId: string } },
) {
  return mutate(
    request,
    params.reviewId,
    new URL(request.url).searchParams.get("action") === "report"
      ? "report"
      : "comment",
  );
}
