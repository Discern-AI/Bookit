import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pathSchema } from "@/lib/path-schema";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = pathSchema.safeParse(body);
  const id = z.string().uuid().safeParse(body?.id);
  if (!parsed.success || !id.success)
    return NextResponse.json(
      {
        error:
          "Check the path title, books and notes. Published paths need at least one book; each work can appear once.",
      },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id.data}))`;
    const existing = await db.readingPath.findUnique({
      where: { id: id.data },
      include: { entries: { orderBy: { position: "asc" } } },
    });
    const { entries, ...fields } = parsed.data;
    if (existing) {
      const same =
        existing.userId === session.user.id &&
        existing.title === fields.title &&
        existing.description === fields.description &&
        existing.isPublic === fields.isPublic &&
        JSON.stringify(
          existing.entries.map((e) => ({ workId: e.workId, note: e.note })),
        ) === JSON.stringify(entries);
      return same
        ? { id: existing.id, version: existing.version }
        : {
            error:
              "This path was already created. Open your paths before trying again.",
            status: 409,
          };
    }
    if (
      (await db.work.count({
        where: { id: { in: entries.map((e) => e.workId) } },
      })) !== entries.length
    )
      return {
        error: "A selected book is no longer in the catalogue.",
        status: 400,
      };
    const path = await db.readingPath.create({
      data: {
        id: id.data,
        userId: session.user.id,
        ...fields,
        entries: { create: entries.map((e, position) => ({ ...e, position })) },
      },
    });
    return { id: path.id, version: path.version };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
  });
}
