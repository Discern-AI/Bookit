import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function PATCH(
  request: Request,
  { params }: { params: { reportId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !["dismiss", "hide"].includes(body.action))
    return Response.json({ error: "Choose dismiss or hide." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const moderator = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { isModerator: true },
    });
    if (!moderator?.isModerator)
      return { status: 403, error: "Moderator access required." };
    const target = await tx.reviewReport.findUnique({
      where: { id: params.reportId },
      select: { reviewId: true },
    });
    if (!target) return { status: 404, error: "Report not found." };
    await tx.$queryRaw`SELECT id FROM "BookReview" WHERE id = ${target.reviewId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ReviewReport" WHERE id = ${params.reportId} FOR UPDATE`;
    const report = await tx.reviewReport.findUnique({
      where: { id: params.reportId },
    });
    if (!report) return { status: 404, error: "Report not found." };
    if (report.status !== "pending")
      return {
        status: 409,
        error: "This report has already been resolved. Reload the queue.",
      };
    if (body.action === "hide") {
      if (report.commentId)
        await tx.reviewComment.update({
          where: { id: report.commentId },
          data: { isHidden: true },
        });
      else
        await tx.bookReview.update({
          where: { id: report.reviewId },
          data: { isHidden: true },
        });
    }
    await tx.reviewReport.update({
      where: { id: report.id },
      data: {
        status: body.action === "hide" ? "hidden" : "dismissed",
        resolvedAt: new Date(),
        resolvedById: session.user.id,
      },
    });
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
