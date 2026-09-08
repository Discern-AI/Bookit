import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
async function follow(pathId: string, enabled: boolean) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pathId}))`;
    const path = await db.readingPath.findFirst({
      where: { id: pathId, isPublic: true },
    });
    if (!path)
      return { error: "Path not found or no longer public.", status: 404 };
    if (enabled)
      await db.readingPathFollow.upsert({
        where: { userId_pathId: { userId: session.user.id, pathId } },
        create: { userId: session.user.id, pathId },
        update: {},
      });
    else
      await db.readingPathFollow.deleteMany({
        where: { userId: session.user.id, pathId },
      });
    return { following: enabled };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
  });
}
export async function PUT(
  _request: Request,
  { params }: { params: { pathId: string } },
) {
  return follow(params.pathId, true);
}
export async function DELETE(
  _request: Request,
  { params }: { params: { pathId: string } },
) {
  return follow(params.pathId, false);
}
