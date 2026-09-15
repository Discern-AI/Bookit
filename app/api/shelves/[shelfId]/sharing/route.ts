import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function PUT(
  request: Request,
  { params }: { params: { shelfId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({ isPublic: z.boolean(), version: z.number().int().min(0) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Provide a visibility and saved version." },
      { status: 400 },
    );
  const userId = session.user.id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "CustomShelf" WHERE id = ${params.shelfId} FOR NO KEY UPDATE`;
    const shelf = await tx.customShelf.findFirst({
      where: { id: params.shelfId, userId },
    });
    if (!shelf) return { status: 404, error: "Shelf not found." };
    if (shelf.shareVersion !== parsed.data.version)
      return {
        status: 409,
        error: "Sharing changed elsewhere. Reload before saving.",
      };
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { profilePublic: true },
    });
    if (parsed.data.isPublic && !user.profilePublic)
      return {
        status: 400,
        error: "Publish your profile before sharing a shelf.",
      };
    await tx.customShelf.update({
      where: { id: shelf.id },
      data: { isPublic: parsed.data.isPublic, shareVersion: { increment: 1 } },
    });
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
