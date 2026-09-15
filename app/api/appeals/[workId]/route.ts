import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function POST(
  request: Request,
  { params }: { params: { workId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({
      reason: z.string().trim().min(10).max(2000),
      moderationVersion: z.number().int().min(0),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Explain your appeal in 10-2,000 characters." },
      { status: 400 },
    );
  const userId = session.user.id;
  const { reason, moderationVersion } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const latest = await tx.bookReview.findFirst({
      where: { userId, workId: params.workId },
      orderBy: { version: "desc" },
    });
    if (!latest?.isHidden)
      return { status: 404, error: "No hidden review to appeal." };
    if (latest.moderationVersion !== moderationVersion)
      return {
        status: 409,
        error: "The moderation decision changed. Reload before appealing.",
      };
    const existing = await tx.reviewAppeal.findUnique({
      where: {
        userId_workId_moderationVersion: {
          userId,
          workId: params.workId,
          moderationVersion,
        },
      },
    });
    if (existing)
      return existing.status === "pending" && existing.reason === reason
        ? { status: 200 }
        : {
            status: 409,
            error:
              "An appeal already exists for this decision. Check Your appeals.",
          };
    await tx.reviewAppeal.create({
      data: {
        userId,
        workId: params.workId,
        moderationVersion,
        reason,
        snapshot: latest.body,
      },
    });
    return { status: 201 };
  });
  return Response.json(result, { status: result.status });
}
