import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sessionSchema } from "@/lib/session-schema";
import { z } from "zod";
const editSchema = z
  .object({
    version: z.number().int().min(0),
    date: z.string(),
    pageStart: z.number(),
    pageEnd: z.number(),
    note: z.string().max(5000),
  })
  .strict();
const deleteSchema = z.object({ version: z.number().int().min(0) }).strict();
async function change(request: Request, sessionId: string, remove: boolean) {
  const session = await auth();
  const reply = (status: number, error?: string) =>
    Response.json(error ? { error } : { ok: true }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (!session?.user.id) return reply(401, "Sign in first.");
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return reply(403, "Use the diary on this site.");
  const raw = await request.json().catch(() => null);
  const parsed = (remove ? deleteSchema : editSchema).safeParse(raw);
  if (!parsed.success) return reply(400, "Check the session fields.");
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const existing = await tx.readingSession.findFirst({
        where: { id: sessionId, userId: session.user.id },
        include: { userBook: { include: { edition: true } } },
      });
      if (!existing) return { status: 404, error: "Session not found." };
      if (existing.deletedAt)
        return remove
          ? { status: 200 }
          : {
              status: 409,
              error: "This session was deleted. Reload your diary.",
            };
      if (existing.version !== parsed.data.version)
        return {
          status: 409,
          error:
            "This session changed elsewhere. Your draft is still here; close and reload the diary before editing again.",
        };
      if (remove) {
        await tx.readingSession.update({
          where: { id: sessionId },
          data: {
            deletedAt: new Date(),
            version: { increment: 1 },
            note: null,
            timeStart: null,
            timeEnd: null,
            pageStart: 0,
            pageEnd: 0,
            finished: false,
          },
        });
      } else {
        const input = editSchema.parse(raw);
        const validated = sessionSchema.safeParse({
          ...input,
          userBookId: existing.userBookId,
          requestId: "00000000-0000-4000-8000-000000000000",
          expectedLastSessionId: null,
          finished: existing.finished,
          timeStart: existing.timeStart?.toISOString() ?? null,
          timeEnd: existing.timeEnd?.toISOString() ?? null,
        });
        if (!validated.success)
          return { status: 400, error: validated.error.issues[0].message };
        if (
          existing.userBook.edition.pageCount &&
          input.pageEnd > existing.userBook.edition.pageCount
        )
          return {
            status: 400,
            error: "The end page exceeds this edition's page count.",
          };
        await tx.readingSession.update({
          where: { id: sessionId },
          data: {
            date: new Date(`${input.date}T12:00:00.000Z`),
            pageStart: input.pageStart,
            pageEnd: input.pageEnd,
            note: input.note || null,
            version: { increment: 1 },
          },
        });
      }
      return { status: 200 };
    });
    return reply(result.status, result.error);
  } catch {
    return reply(503, "Could not save this session change. Try again.");
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  return change(request, params.sessionId, false);
}
export async function DELETE(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  return change(request, params.sessionId, true);
}
