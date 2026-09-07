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
  const existing = await prisma.userBook.findFirst({
    where: { id: params.userBookId, userId: session.user.id },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const { customShelfIds, ...data } = parsed.data;
  if (
    customShelfIds &&
    (await prisma.customShelf.count({
      where: { id: { in: customShelfIds }, userId: session.user.id },
    })) !== new Set(customShelfIds).size
  )
    return NextResponse.json({ error: "Shelf not found." }, { status: 400 });
  const book = await prisma.userBook.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...(data.shelf && data.shelf !== existing.shelf
        ? {
            dateStarted:
              data.shelf === "reading_now"
                ? (existing.dateStarted ?? new Date())
                : existing.dateStarted,
            dateFinished: data.shelf === "read" ? new Date() : null,
          }
        : {}),
      ...(customShelfIds
        ? { customShelves: { set: customShelfIds.map((id) => ({ id })) } }
        : {}),
    },
    include: libraryInclude,
  });
  return NextResponse.json({ book: serializeBook(book) });
}
