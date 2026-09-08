import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateEdition } from "@/lib/library";
import { SHELVES } from "@/lib/shelves";
import { libraryInclude, serializeBook } from "@/lib/book-data";
const schema = z.object({
  editionId: z.string().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(500),
  isbn13: z.string().max(30).optional(),
  year: z.number().int().min(1).max(3000).optional(),
  openLibraryWorkId: z
    .string()
    .regex(/^OL\d+W$/)
    .optional(),
  coverUrl: z
    .string()
    .url()
    .refine((s) => s.startsWith("https://covers.openlibrary.org/"))
    .optional(),
  pageCount: z.number().int().positive().max(100000).optional(),
  shelf: z.enum(SHELVES),
});
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the book details and try again." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const edition = parsed.data.editionId
      ? await db.edition.findUnique({
          where: { id: parsed.data.editionId },
          include: { work: true },
        })
      : await findOrCreateEdition(parsed.data, db);
    if (!edition)
      return {
        error: "That edition is no longer available. Search again.",
        status: 404,
      };
    const existing = await db.userBook.findUnique({
      where: {
        userId_editionId: { userId: session.user.id, editionId: edition.id },
      },
      include: libraryInclude,
    });
    if (existing) return { book: serializeBook(existing), duplicate: true };
    const book = await db.userBook.create({
      data: {
        userId: session.user.id,
        editionId: edition.id,
        shelf: parsed.data.shelf,
        dateStarted: parsed.data.shelf === "reading_now" ? new Date() : null,
        dateFinished: parsed.data.shelf === "read" ? new Date() : null,
      },
      include: libraryInclude,
    });
    return { book: serializeBook(book), duplicate: false };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
  });
}
