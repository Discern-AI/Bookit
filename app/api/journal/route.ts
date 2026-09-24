import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { entrySchema, sameOriginJson } from "@/lib/book-journal";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!sameOriginJson(request))
    return Response.json({ error: "Use Folio on this site." }, { status: 403 });
  const input = entrySchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json(
      { error: input.error.issues[0]?.message ?? "Check the entry." },
      { status: 400 },
    );
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const d = input.data;
      if (
        d.workId &&
        !(await db.userBook.findFirst({
          where: { userId: session.user.id, edition: { workId: d.workId } },
          select: { id: true },
        }))
      )
        return { status: 404, error: "Book not found in your library." };
      const old = await db.bookEntry.findUnique({ where: { id: d.id } });
      if (old)
        return old.userId === session.user.id &&
          !old.deletedAt &&
          old.workId === d.workId &&
          old.kind === d.kind &&
          old.text === d.text &&
          old.url === (d.url ?? null) &&
          old.role === (d.role ?? null) &&
          old.conversationId === (d.conversationId ?? null)
          ? { status: 200, entry: old }
          : {
              status: 409,
              error:
                "This entry changed or was removed. Reload before trying again.",
            };
      const entry = await db.bookEntry.create({
        data: { ...d, userId: session.user.id },
      });
      return { status: 200, entry };
    });
    return Response.json(result, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Could not save your entry. Your draft is still here; try again.",
      },
      { status: 503 },
    );
  }
}
