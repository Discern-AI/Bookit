import { ensureReadingCycle } from "@/lib/reading-cycles";
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
      if (existing.deletedAt)
        return {
          error:
            "This session was deleted. Start a new log to record more reading.",
          status: 409,
        };
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
    if (serializeBook(book).lastSessionId !== input.expectedLastSessionId)
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
    const cycle = await ensureReadingCycle(db, book);
    if (cycle.dateFinished)
      return {
        status: 409,
        error:
          "This reading is finished. Start a reread to log more pages, or edit an earlier session in the diary.",
      };
    if (
      cycle.number > 1 &&
      cycle.dateStarted &&
      date.toISOString().slice(0, 10) <
        cycle.dateStarted.toISOString().slice(0, 10)
    )
      return {
        error: "Choose a date on or after this reread started.",
        status: 400,
      };
    await db.readingSession.create({
      data: {
        cycleId: cycle.id,
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
    await db.readingCycle.update({
      where: { id: cycle.id },
      data: {
        dateStarted:
          !cycle.dateStarted || date < cycle.dateStarted
            ? date
            : cycle.dateStarted,
        ...(input.finished
          ? { dateFinished: date, version: { increment: 1 } }
          : {}),
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
