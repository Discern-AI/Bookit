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
    await db.readingCycle.create({
      data: {
        userBookId: book.id,
        number: cycle.number + 1,
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
