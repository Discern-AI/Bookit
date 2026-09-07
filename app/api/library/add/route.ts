import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateEdition } from "@/lib/library";
import { SHELVES } from "@/lib/shelves";

const addSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  isbn13: z.string().optional(),
  year: z.number().optional(),
  openLibraryWorkId: z.string().optional(),
  shelf: z.enum(SHELVES),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid book." }, { status: 400 });

  const edition = await findOrCreateEdition(parsed.data);

  const userBook = await prisma.userBook.create({
    data: {
      userId: session.user.id,
      editionId: edition.id,
      shelf: parsed.data.shelf,
    },
    include: { edition: { include: { work: true } } },
  });

  return NextResponse.json({ userBook });
}
