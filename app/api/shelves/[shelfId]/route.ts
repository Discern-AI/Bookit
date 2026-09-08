import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function PATCH(
  request: Request,
  { params }: { params: { shelfId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Give your shelf a name." },
      { status: 400 },
    );
  try {
    const shelf = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const existing = await db.customShelf.findFirst({
        where: { id: params.shelfId, userId: session.user.id },
      });
      return existing
        ? db.customShelf.update({
            where: { id: existing.id },
            data: { name: parsed.data.name },
          })
        : null;
    });
    return NextResponse.json(
      shelf ? { shelf } : { error: "Shelf not found." },
      { status: shelf ? 200 : 404 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return NextResponse.json(
        { error: "You already have a shelf with that name." },
        { status: 409 },
      );
    throw error;
  }
}
export async function DELETE(
  _request: Request,
  { params }: { params: { shelfId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    return db.customShelf.deleteMany({
      where: { id: params.shelfId, userId: session.user.id },
    });
  });
  return NextResponse.json(
    result.count ? { ok: true } : { error: "Shelf not found." },
    { status: result.count ? 200 : 404 },
  );
}
