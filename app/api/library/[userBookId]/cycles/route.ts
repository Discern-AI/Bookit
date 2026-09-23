import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { validDate, shiftDay } from "@/lib/reading";
import { ensureReadingCycle } from "@/lib/reading-cycles";
import { libraryInclude, serializeBook } from "@/lib/book-data";
type Context = { params: { userBookId: string } };
function reply(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  const book = await prisma.userBook.findFirst({
    where: { id: params.userBookId, userId: session.user.id },
    select: {
      id: true,
      shelf: true,
      dateStarted: true,
      dateFinished: true,
      readingCycles: {
        where: { cancelledAt: null },
        orderBy: { number: "desc" },
        include: {
          _count: { select: { sessions: true } },
          sessions: {
            where: { deletedAt: null },
            select: { pageStart: true, pageEnd: true },
          },
        },
      },
      readingSessions: {
        where: { deletedAt: null, cycleId: null },
        select: { pageStart: true, pageEnd: true },
      },
    },
  });
  if (!book) return reply({ error: "Book not found." }, 404);
  const cycles = book.readingCycles.length
    ? book.readingCycles
    : [
        {
          id: null,
          number: 1,
          isCurrent: true,
          dateStarted: book.dateStarted,
          dateFinished: book.dateFinished,
          version: 0,
          sessions: book.readingSessions,
          _count: { sessions: book.readingSessions.length },
        },
      ];
  return reply({
    cycles: cycles.map((c) => ({
      id: c.id,
      number: c.number,
      isCurrent: c.isCurrent,
      dateStarted: c.dateStarted?.toISOString() ?? null,
      dateFinished: c.dateFinished?.toISOString() ?? null,
      version: c.version,
      canEdit: !!c.dateFinished || !c.isCurrent || book.shelf === "read",
      canCancel:
        c.isCurrent &&
        c.number > 1 &&
        !c.dateFinished &&
        book.shelf !== "read" &&
        c._count.sessions === 0,
      sessionCount: c.sessions.length,
      pages: c.sessions.reduce((sum, s) => sum + s.pageEnd - s.pageStart, 0),
    })),
  });
}
const correctionDate = z
  .string()
  .refine(validDate)
  .refine((date) => date <= shiftDay(new Date().toISOString().slice(0, 10), 1));
const identity = {
  cycleId: z.string().nullable(),
  version: z.number().int().min(0),
};
const schema = z.union([
  z.object({ ...identity, dateFinished: correctionDate }).strict(),
  z.object({ ...identity, dateStarted: correctionDate }).strict(),
]);
export async function PATCH(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return reply({ error: "Use the library on this site." }, 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply({ error: "Choose a valid date, today or earlier." }, 400);
  const input = parsed.data;
  const isStart = "dateStarted" in input;
  const value = isStart ? input.dateStarted : input.dateFinished;
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const book = await db.userBook.findFirst({
        where: { id: params.userBookId, userId: session.user.id },
        include: {
          readingCycles: {
            where: { cancelledAt: null },
            orderBy: { number: "asc" },
          },
        },
      });
      if (!book) return { status: 404, error: "Book not found." };
      const cycle = input.cycleId
        ? book.readingCycles.find((c) => c.id === input.cycleId)
        : book.readingCycles.length
          ? undefined
          : {
              id: null,
              number: 1,
              isCurrent: true,
              dateStarted: book.dateStarted,
              dateFinished: book.dateFinished,
              version: 0,
            };
      if (!cycle || cycle.version !== input.version)
        return {
          status: 409,
          error:
            "This reading changed. Your date is still here; cancel and reload history before trying again.",
        };
      if (
        !isStart &&
        cycle.isCurrent &&
        !cycle.dateFinished &&
        book.shelf !== "read"
      )
        return {
          status: 409,
          error: "Finish this reading before correcting its completion date.",
        };
      const next = book.readingCycles.find((c) => c.number > cycle.number);
      const boundarySession = await db.readingSession.findFirst({
        where: { userBookId: book.id, cycleId: cycle.id, deletedAt: null },
        orderBy: { date: isStart ? "asc" : "desc" },
        select: { date: true },
      });
      const day = (date: Date) => date.toISOString().slice(0, 10);
      if (isStart) {
        const previous = book.readingCycles
          .filter((c) => c.number < cycle.number)
          .at(-1);
        if (previous?.dateFinished && value < day(previous.dateFinished))
          return {
            status: 400,
            error:
              "The start date must be on or after the previous reading finishes.",
          };
        if (
          (cycle.dateFinished && value > day(cycle.dateFinished)) ||
          (boundarySession && value > day(boundarySession.date)) ||
          (next?.dateStarted && value > day(next.dateStarted))
        )
          return {
            status: 400,
            error:
              "The start date must be on or before its sessions, finish date and next reread.",
          };
      } else {
        if (
          (cycle.dateStarted && value < day(cycle.dateStarted)) ||
          (boundarySession && value < day(boundarySession.date))
        )
          return {
            status: 400,
            error:
              "The finish date must be on or after the start and all recorded sessions for this reading.",
          };
        if (next?.dateStarted && value > day(next.dateStarted))
          return {
            status: 400,
            error:
              "The finish date must be on or before the next reread starts.",
          };
      }
      const current = cycle.id ? cycle : await ensureReadingCycle(db, book);
      const date = new Date(`${value}T12:00:00.000Z`);
      const dates = isStart ? { dateStarted: date } : { dateFinished: date };
      await db.readingCycle.update({
        where: { id: current.id! },
        data: { ...dates, version: { increment: 1 } },
      });
      if (cycle.isCurrent)
        await db.userBook.update({
          where: { id: book.id },
          data: dates,
        });
      const updated = await db.userBook.findUniqueOrThrow({
        where: { id: book.id },
        include: libraryInclude,
      });
      return { status: 200, book: serializeBook(updated) };
    });
    return reply(result, result.status);
  } catch {
    return reply({ error: "Could not save the date. Try again." }, 503);
  }
}
