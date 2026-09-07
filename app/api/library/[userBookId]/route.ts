import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SHELVES } from "@/lib/shelves";

const patchSchema = z.object({
  shelf: z.enum(SHELVES).optional(),
  rating: z.number().min(0).max(5).optional(),
  privateNotes: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: { userBookId: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.userBook.findUnique({ where: { id: params.userBookId } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const userBook = await prisma.userBook.update({
    where: { id: params.userBookId },
    data: parsed.data,
    include: { edition: { include: { work: true } } },
  });

  return NextResponse.json({ userBook });
}
