import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewSchema, deleteReviewSchema } from "@/lib/community";
export async function PUT(
  request: Request,
  { params }: { params: { workId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Write a review of up to 10,000 characters and choose a rating from 1 to 5 or no rating.",
      },
      { status: 400 },
    );
  const userId = session.user.id;
  const { version, ...data } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (data.isPublic && !user.profilePublic)
      return {
        error: "Publish your profile in Settings before publishing a review.",
        status: 400,
      };
    const owned = await tx.userBook.findFirst({
      where: { userId, edition: { workId: params.workId } },
      select: { id: true },
    });
    if (!owned)
      return {
        error: "Add this book to your library before reviewing it.",
        status: 403,
      };
    const latest = await tx.bookReview.findFirst({
      where: { userId, workId: params.workId },
      orderBy: { version: "desc" },
    });
    if ((latest?.version ?? 0) !== version)
      return {
        error: "This review changed elsewhere. Reload before saving.",
        status: 409,
      };
    const existing = latest?.active ? latest : null;
    const review = existing
      ? await tx.bookReview.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.bookReview.create({
          data: {
            ...data,
            userId,
            workId: params.workId,
            version: version + 1,
            isHidden: !!latest?.isHidden,
            moderationVersion: latest?.moderationVersion ?? 0,
          },
        });
    return { version: review.version, status: 200 };
  });
  return Response.json(result, { status: result.status });
}

export async function DELETE(
  request: Request,
  { params }: { params: { workId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = deleteReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "A review ID and version are required." },
      { status: 400 },
    );
  const userId = session.user.id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "BookReview" WHERE id = ${parsed.data.id} FOR NO KEY UPDATE`;
    const review = await tx.bookReview.findFirst({
      where: { id: parsed.data.id, userId, workId: params.workId },
    });
    if (!review) return { status: 404, error: "Review not found." };
    if (review.deletedAt) {
      if (review.version === parsed.data.version + 1)
        return { status: 200, deleted: true };
      return {
        status: 409,
        error: "This review changed elsewhere. Reload before deleting.",
      };
    }
    if (review.version !== parsed.data.version)
      return {
        status: 409,
        error: "This review changed elsewhere. Reload before deleting.",
      };
    await tx.bookReview.update({
      where: { id: review.id },
      data: {
        body: "",
        rating: null,
        isPublic: false,
        active: null,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await tx.reviewLike.deleteMany({ where: { reviewId: review.id } });
    return { status: 200, deleted: true };
  });
  return Response.json(result, { status: result.status });
}
