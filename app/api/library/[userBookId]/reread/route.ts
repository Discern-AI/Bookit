import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { validDate, shiftDay } from "@/lib/reading";
import { libraryInclude, serializeBook } from "@/lib/book-data";
import { ensureReadingCycle } from "@/lib/reading-cycles";
const schema = z
  .object({
    requestId: z.string().uuid(),
    cycleId: z.string().nullable(),
    version: z.number().int().min(0),
    date: z
      .string()
      .refine(validDate)
      .refine(
        (date) => date <= shiftDay(new Date().toISOString().slice(0, 10), 1),
      ),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: { userBookId: string } },
) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return Response.json(
      { error: "Use the library on this site." },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Choose a valid start date." },
      { status: 400 },
    );
  const input = parsed.data;
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const book = await db.userBook.findFirst({
      where: { id: params.userBookId, userId: session.user.id },
      include: libraryInclude,
    });
    if (!book) return { status: 404, error: "Book not found." };
    const duplicate = await db.readingCycle.findUnique({
      where: { requestId: input.requestId },
    });
    if (duplicate?.cancelledAt)
      return {
        status: 409,
        error:
          "This reread was cancelled. Start a new reread if you want to read again.",
      };
    if (duplicate)
      return duplicate.userBookId === book.id &&
        duplicate.dateStarted?.toISOString().slice(0, 10) === input.date
        ? { status: 200, book: serializeBook(book) }
        : { status: 409, error: "This request was already used." };
    const current = book.readingCycles[0];
    if (
      (current?.id ?? null) !== input.cycleId ||
      (current?.version ?? 0) !== input.version
    )
      return {
        status: 409,
        error:
          "This reading changed. Close and reopen the book before starting a reread.",
      };
    if (!serializeBook(book).canReread)
      return {
        status: 409,
        error: "Finish the current reading before starting a reread.",
      };
    const previousFinish = current?.dateFinished ?? book.dateFinished;
    const date = new Date(`${input.date}T12:00:00.000Z`);
    if (
      previousFinish &&
      input.date < previousFinish.toISOString().slice(0, 10)
    )
      return {
        status: 400,
        error: "Start the reread on or after the previous finish date.",
      };
    const cycle = await ensureReadingCycle(db, book);
    await db.readingCycle.update({
      where: { id: cycle.id },
      data: { isCurrent: false, version: { increment: 1 } },
    });
    const latestNumber = await db.readingCycle.aggregate({
      where: { userBookId: book.id },
      _max: { number: true },
    });
    await db.readingCycle.create({
      data: {
        userBookId: book.id,
        number: (latestNumber._max.number ?? cycle.number) + 1,
        dateStarted: date,
        requestId: input.requestId,
      },
    });
    const updated = await db.userBook.update({
      where: { id: book.id },
      data: { shelf: "reading_now", dateStarted: date, dateFinished: null },
      include: libraryInclude,
    });
    return { status: 200, book: serializeBook(updated) };
  });
  return Response.json(result, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

const cancellationSchema = z
  .object({ cycleId: z.string().min(1), version: z.number().int().min(0) })
  .strict();
export async function DELETE(
  request: Request,
  { params }: { params: { userBookId: string } },
) {
  const reply = (data: unknown, status: number) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return reply({ error: "Use the library on this site." }, 403);
  const parsed = cancellationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply({ error: "Reload reading history and try again." }, 400);
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const book = await db.userBook.findFirst({
        where: { id: params.userBookId, userId: session.user.id },
        include: libraryInclude,
      });
      if (!book) return { status: 404, error: "Book not found." };
      const cycle = await db.readingCycle.findFirst({
        where: { id: parsed.data.cycleId, userBookId: book.id },
      });
      if (!cycle) return { status: 404, error: "Reading not found." };
      if (cycle.cancelledAt) return { status: 200, book: serializeBook(book) };
      if (!cycle.isCurrent || cycle.version !== parsed.data.version)
        return {
          status: 409,
          error:
            "This reading changed. Reload reading history before trying again.",
        };
      if (cycle.number <= 1 || cycle.dateFinished || book.shelf === "read")
        return {
          status: 409,
          error: "Only an unfinished reread can be cancelled.",
        };
      if (await db.readingSession.count({ where: { cycleId: cycle.id } }))
        return {
          status: 409,
          error:
            "This reread has logged sessions and cannot be cancelled, even if those sessions were deleted.",
        };
      const previous = await db.readingCycle.findFirst({
        where: {
          userBookId: book.id,
          cancelledAt: null,
          number: { lt: cycle.number },
        },
        orderBy: { number: "desc" },
      });
      if (!previous)
        return {
          status: 409,
          error: "The previous reading could not be found.",
        };
      await db.readingCycle.update({
        where: { id: cycle.id },
        data: {
          isCurrent: false,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
      await db.readingCycle.update({
        where: { id: previous.id },
        data: { isCurrent: true, version: { increment: 1 } },
      });
      const updated = await db.userBook.update({
        where: { id: book.id },
        data: {
          shelf: "read",
          dateStarted: previous.dateStarted,
          dateFinished: previous.dateFinished,
        },
        include: libraryInclude,
      });
      return { status: 200, book: serializeBook(updated) };
    });
    return reply(result, result.status);
  } catch {
    return reply({ error: "Could not cancel this reread. Try again." }, 503);
  }
}
