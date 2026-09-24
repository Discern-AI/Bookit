import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sameOriginJson } from "@/lib/book-journal";
const schema = z
  .object({
    version: z.number().int().min(0),
    workId: z.string().min(1).nullable().optional(),
    text: z.string().trim().min(1).max(12000).optional(),
  })
  .strict();
async function change(request: Request, entryId: string, remove: boolean) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!sameOriginJson(request))
    return Response.json({ error: "Use Folio on this site." }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success || !z.string().uuid().safeParse(entryId).success)
    return Response.json({ error: "Check the entry." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const old = await db.bookEntry.findFirst({
        where: { id: entryId, userId: session.user.id },
      });
      if (!old) return { status: 404, error: "Entry not found." };
      if (old.deletedAt || old.version !== input.data.version)
        return {
          status: 409,
          error: "This entry changed. Reload before trying again.",
        };
      const data = { workId: input.data.workId, text: input.data.text };
      if (!remove && old.kind !== "chat" && data.workId !== undefined)
        return {
          status: 400,
          error: "Only chat entries can be moved between books.",
        };
      if (
        data.workId &&
        !(await db.userBook.findFirst({
          where: { userId: session.user.id, edition: { workId: data.workId } },
          select: { id: true },
        }))
      )
        return { status: 404, error: "Book not found." };
      const entry = await db.bookEntry.update({
        where: { id: old.id },
        data: {
          ...(remove ? { deletedAt: new Date(), text: "", url: null } : data),
          version: { increment: 1 },
        },
      });
      return { status: 200, entry };
    });
    return Response.json(result, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Could not update this entry. Try again." },
      { status: 503 },
    );
  }
}
export async function PATCH(
  r: Request,
  { params }: { params: { entryId: string } },
) {
  return change(r, params.entryId, false);
}
export async function DELETE(
  r: Request,
  { params }: { params: { entryId: string } },
) {
  return change(r, params.entryId, true);
}
