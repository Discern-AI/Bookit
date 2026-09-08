import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sessionSchema } from "@/lib/session-schema";
import { libraryInclude, serializeBook } from "@/lib/book-data";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = sessionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  const input = parsed.data;
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const book = await db.userBook.findFirst({
      where: { id: input.userBookId, userId: session.user.id },
      include: libraryInclude,
    });
    if (!book) return { error: "Book not found.", status: 404 };
    const existing = await db.readingSession.findUnique({
      where: { requestId: input.requestId },
    });
    if (existing) {
      if (
        existing.userId !== session.user.id ||
        existing.userBookId !== book.id ||
        existing.finished !== input.finished ||
        existing.pageStart !== input.pageStart ||
        existing.pageEnd !== input.pageEnd ||
        existing.date.toISOString().slice(0, 10) !== input.date ||
        (existing.note ?? "") !== input.note ||
        existing.timeStart?.toISOString() !== (input.timeStart ?? undefined) ||
        existing.timeEnd?.toISOString() !== (input.timeEnd ?? undefined)
      )
        return {
          error: "This request was already used for a different session.",
          status: 409,
        };
      return { book: serializeBook(book), duplicate: true, status: 200 };
    }
    if ((book.readingSessions[0]?.id ?? null) !== input.expectedLastSessionId)
      return {
        error:
          "Your reading progress changed. Reopen the log form to use the latest pages.",
        status: 409,
      };
    if (book.edition.pageCount && input.pageEnd > book.edition.pageCount)
      return {
        error: `This edition has ${book.edition.pageCount} pages. Check the end page.`,
        status: 400,
      };
    const date = new Date(`${input.date}T12:00:00.000Z`);
    await db.readingSession.create({
      data: {
        userId: session.user.id,
        userBookId: book.id,
        requestId: input.requestId,
        finished: input.finished,
        date,
        pageStart: input.pageStart,
        pageEnd: input.pageEnd,
        note: input.note || null,
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
      },
    });
    const updated = await db.userBook.update({
      where: { id: book.id },
      data: {
        dateStarted:
          !book.dateStarted || date < book.dateStarted
            ? date
            : book.dateStarted,
        ...(input.finished
          ? { shelf: "read", dateFinished: date }
          : book.shelf !== "read"
            ? { shelf: "reading_now" }
            : {}),
      },
      include: libraryInclude,
    });
    return { book: serializeBook(updated), duplicate: false, status: 200 };
  });
  return NextResponse.json(result, { status: result.status });
}
