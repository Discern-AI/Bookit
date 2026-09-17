import { ensureReadingCycle } from "@/lib/reading-cycles";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SHELVES } from "@/lib/shelves";
import { libraryInclude, serializeBook } from "@/lib/book-data";
const schema = z.object({
  shelf: z.enum(SHELVES).optional(),
  rating: z.number().min(0).max(5).multipleOf(0.5).nullable().optional(),
  privateNotes: z.string().max(20000).optional(),
  customShelfIds: z.array(z.string()).max(100).optional(),
});
export async function PATCH(
  request: Request,
  { params }: { params: { userBookId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const { customShelfIds, ...data } = parsed.data;
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const existing = await db.userBook.findFirst({
      where: { id: params.userBookId, userId: session.user.id },
    });
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cycle = await ensureReadingCycle(db, existing);
    if (
      data.shelf === "reading_now" &&
      existing.shelf !== "reading_now" &&
      (cycle.dateFinished || existing.shelf === "read")
    )
      return NextResponse.json(
        { error: "Use Start reread to preserve the previous finish." },
        { status: 409 },
      );
    if (
      customShelfIds &&
      (await db.customShelf.count({
        where: { id: { in: customShelfIds }, userId: session.user.id },
      })) !== new Set(customShelfIds).size
    )
      return NextResponse.json({ error: "Shelf not found." }, { status: 400 });
    const book = await db.userBook.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(data.shelf && data.shelf !== existing.shelf
          ? {
              dateStarted:
                data.shelf === "reading_now"
                  ? (existing.dateStarted ?? new Date())
                  : existing.dateStarted,
              dateFinished:
                data.shelf === "read"
                  ? (cycle.dateFinished ?? new Date())
                  : null,
            }
          : {}),
        ...(customShelfIds
          ? { customShelves: { set: customShelfIds.map((id) => ({ id })) } }
          : {}),
      },
      include: libraryInclude,
    });
    if (data.shelf && existing.shelf !== data.shelf)
      await db.readingCycle.update({
        where: { id: cycle.id },
        data: {
          dateStarted: cycle.dateStarted ?? book.dateStarted,
          dateFinished: cycle.dateFinished ?? book.dateFinished,
          version: { increment: 1 },
        },
      });
    const fresh = await db.userBook.findUniqueOrThrow({
      where: { id: book.id },
      include: libraryInclude,
    });
    return NextResponse.json({ book: serializeBook(fresh) });
  });
}
