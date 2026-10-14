import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import { cardProjectAction, cardProjectInclude } from "@/lib/card-projects";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const parsed = cardProjectAction.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply(
      { error: "Check the project name, text lengths and book selections." },
      400,
    );
  const d = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"card-project:" + d.id}))`;
      const old = await tx.cardProject.findUnique({
        where: { id: d.id },
        include: cardProjectInclude,
      });
      if (old && old.userId !== session.user.id)
        return reply({ error: "Project not found." }, 404);
      const stale = () =>
        reply(
          {
            error:
              "This project changed or was deleted elsewhere. Your draft is kept; open the saved project before trying again.",
          },
          409,
        );
      if (d.action === "delete") {
        if (!old) return reply({ error: "Project not found." }, 404);
        if (old.deletedAt) return reply({ ok: true });
        if (old.version !== d.version) return stale();
        await tx.cardProjectBook.deleteMany({ where: { projectId: d.id } });
        await tx.cardProject.update({
          where: { id: d.id },
          data: {
            title: "",
            caption: "",
            quote: "",
            reference: "",
            heading: "",
            includeByline: false,
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        return reply({ ok: true });
      }
      if (old?.deletedAt) return stale();
      const { books, ...fields } = d.project;
      const same =
        old &&
        Object.entries(fields).every(
          ([key, value]) => old[key as keyof typeof old] === value,
        ) &&
        JSON.stringify(
          old.books.map(({ workId, editionId }) => ({ workId, editionId })),
        ) === JSON.stringify(books);
      if (old && old.version !== d.version)
        return same && old.version === d.version + 1
          ? reply({ id: old.id, version: old.version })
          : stale();
      if (!old && d.version !== 0) return stale();
      for (const b of books) {
        const retained = old?.books.some(
          (previous) =>
            previous.workId === b.workId && previous.editionId === b.editionId,
        );
        if (
          !retained &&
          !(await tx.userBook.findFirst({
            where: {
              userId: session.user.id,
              editionId: b.editionId,
              edition: { workId: b.workId },
            },
            select: { id: true },
          }))
        )
          return reply(
            { error: "Select new books from your own collection." },
            400,
          );
      }
      if (same) return reply({ id: old.id, version: old.version });
      if (old)
        await tx.cardProjectBook.deleteMany({ where: { projectId: d.id } });
      const data = {
        ...fields,
        books: { create: books.map((b, position) => ({ ...b, position })) },
      };
      const saved = old
        ? await tx.cardProject.update({
            where: { id: d.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.cardProject.create({
            data: { id: d.id, userId: session.user.id, ...data },
          });
      return reply({ id: saved.id, version: saved.version });
    });
  } catch {
    return reply(
      { error: "Could not save the project. Your draft is kept; try again." },
      503,
    );
  }
}
