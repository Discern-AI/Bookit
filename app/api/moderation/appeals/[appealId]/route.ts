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
      reviewId: z.string().min(1),
      reviewVersion: z.number().int().min(1),
      response: z.string().trim().min(10).max(2000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Provide a decision and explanation of 10-2,000 characters." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    const moderator = await tx.user.findUnique({
      where: { id: session.user.id },
      select: { isModerator: true },
    });
    if (!moderator?.isModerator)
      return { status: 403, error: "Moderator access required." };
    const target = await tx.reviewAppeal.findUnique({
      where: { id: params.appealId },
      select: { userId: true },
    });
    if (!target) return { status: 404, error: "Appeal not found." };
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${target.userId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ReviewAppeal" WHERE id = ${params.appealId} FOR UPDATE`;
    const appeal = await tx.reviewAppeal.findUniqueOrThrow({
      where: { id: params.appealId },
    });
    const latest = await tx.bookReview.findFirst({
      where: { userId: appeal.userId, workId: appeal.workId },
      orderBy: { version: "desc" },
    });
    if (
      appeal.status !== "pending" ||
      !latest ||
      latest.id !== parsed.data.reviewId ||
      latest.version !== parsed.data.reviewVersion ||
      latest.moderationVersion !== appeal.moderationVersion
    )
      return {
        status: 409,
        error: "The appeal or review changed. Reload before deciding.",
      };
    if (parsed.data.action === "restore")
      await tx.bookReview.updateMany({
        where: { userId: appeal.userId, workId: appeal.workId },
        data: { isHidden: false, moderationVersion: { increment: 1 } },
      });
    await tx.reviewAppeal.update({
      where: { id: appeal.id },
      data: {
        status: parsed.data.action === "restore" ? "restored" : "rejected",
        response: parsed.data.response,
        resolvedAt: new Date(),
        resolvedById: session.user.id,
      },
    });
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
