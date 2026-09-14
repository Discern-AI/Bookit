import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
async function follow(readerId: string, enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const followerId = session.user.id;
  if (readerId === followerId)
    return Response.json(
      { error: "You cannot follow yourself." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${readerId} FOR NO KEY UPDATE`;
    if (enabled) {
      const reader = await tx.user.findFirst({
        where: { id: readerId, profilePublic: true },
        select: { id: true },
      });
      if (!reader)
        return { error: "This profile is no longer public.", status: 404 };
      await tx.readerFollow.upsert({
        where: { followerId_readerId: { followerId, readerId } },
        create: { followerId, readerId },
        update: {},
      });
    } else
      await tx.readerFollow.deleteMany({ where: { followerId, readerId } });
    return { following: enabled, status: 200 };
  });
  return Response.json(result, { status: result.status });
}
export async function PUT(
  _request: Request,
  { params }: { params: { readerId: string } },
) {
  return follow(params.readerId, true);
}
export async function DELETE(
  _request: Request,
  { params }: { params: { readerId: string } },
) {
  return follow(params.readerId, false);
}
