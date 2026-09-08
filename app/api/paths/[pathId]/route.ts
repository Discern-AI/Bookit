import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pathSchema } from "@/lib/path-schema";
async function mutate(request: Request, pathId: string, remove: boolean) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const version = z.number().int().positive().safeParse(body?.version);
  const parsed = pathSchema.safeParse(body);
  if (!version.success || (!remove && !parsed.success))
    return NextResponse.json(
      {
        error:
          "Check the path title, books and notes. Published paths need at least one book; each work can appear once.",
      },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pathId}))`;
    const current = await db.readingPath.findFirst({
      where: { id: pathId, userId: session.user.id },
    });
    if (!current) return { error: "Not found", status: 404 };
    if (current.version !== version.data)
      return {
        error:
          "This path changed in another tab. Your draft is still here. Reload the saved path before making further changes.",
        status: 409,
      };
    if (remove) {
      await db.readingPath.delete({ where: { id: pathId } });
      return { deleted: true };
    }
    if (!parsed.success) return { error: "Invalid path", status: 400 };
    const { entries, ...fields } = parsed.data;
    if (
      (await db.work.count({
        where: { id: { in: entries.map((e) => e.workId) } },
      })) !== entries.length
    )
      return {
        error: "A selected book is no longer in the catalogue.",
        status: 400,
      };
    await db.readingPathEntry.deleteMany({ where: { pathId } });
    const saved = await db.readingPath.update({
      where: { id: pathId },
      data: {
        ...fields,
        version: { increment: 1 },
        entries: { create: entries.map((e, position) => ({ ...e, position })) },
      },
    });
    return { id: saved.id, version: saved.version };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: { pathId: string } },
) {
  return mutate(request, params.pathId, false);
}
export async function DELETE(
  request: Request,
  { params }: { params: { pathId: string } },
) {
  return mutate(request, params.pathId, true);
}
