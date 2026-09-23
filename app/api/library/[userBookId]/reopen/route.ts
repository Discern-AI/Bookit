import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ensureReadingCycle } from "@/lib/reading-cycles";
import { libraryInclude, serializeBook } from "@/lib/book-data";
const schema = z
  .object({
    cycleId: z.string().min(1).nullable(),
    version: z.number().int().min(0),
  })
  .strict();
function reply(data: unknown, status: number) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(
  request: Request,
  { params }: { params: { userBookId: string } },
) {
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
    return reply({ error: "Reload reading history and try again." }, 400);
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const book = await db.userBook.findFirst({
        where: { id: params.userBookId, userId: session.user.id },
        include: libraryInclude,
      });
      if (!book) return { status: 404, error: "Book not found." };
      const current = book.readingCycles[0];
      if (
        (current?.id ?? null) !== parsed.data.cycleId ||
        (current?.version ?? 0) !== parsed.data.version
      )
        return {
          status: 409,
          error:
            "This reading changed. Cancel and reload history before trying again.",
        };
      if (!current?.dateFinished && !book.dateFinished && book.shelf !== "read")
        return {
          status: 409,
          error: "Only a completed current reading can be reopened.",
        };
      const cycle = await ensureReadingCycle(db, book);
      await db.readingCycle.update({
        where: { id: cycle.id },
        data: { dateFinished: null, version: { increment: 1 } },
      });
      const updated = await db.userBook.update({
        where: { id: book.id },
        data: {
          shelf: "reading_now",
          dateFinished: null,
        },
        include: libraryInclude,
      });
      return { status: 200, book: serializeBook(updated) };
    });
    return reply(result, result.status);
  } catch {
    return reply({ error: "Could not reopen this reading. Try again." }, 503);
  }
}
