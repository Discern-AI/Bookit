import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import {
  additionalVideoLinksSchema,
  videoProjectAction,
  videoProjectInclude,
} from "@/lib/video-projects";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const parsed = videoProjectAction.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return reply(
      {
        error:
          "Check the name, text lengths and book selections. Use unique http/https video links without login details, with at most five additional links. Drafts must not include posted links.",
      },
      400,
    );
  const d = parsed.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"video-project:" + d.id}))`;
      const old = await tx.videoProject.findUnique({
        where: { id: d.id },
        include: videoProjectInclude,
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
        await tx.videoClip.deleteMany({ where: { projectId: d.id } });
        await tx.videoProjectBook.deleteMany({ where: { projectId: d.id } });
        await tx.videoProject.update({
          where: { id: d.id },
          data: {
            title: "",
            script: "",
            notes: "",
            publishedUrl: "",
            additionalLinks: [],
            platform: "other",
            status: "idea",
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
        Object.entries(fields).every(([key, value]) =>
          key === "additionalLinks"
            ? JSON.stringify(
                additionalVideoLinksSchema.parse(old.additionalLinks),
              ) === JSON.stringify(value)
            : old[key as keyof typeof old] === value,
        ) &&
        JSON.stringify(old.books.map(({ workId }) => ({ workId }))) ===
          JSON.stringify(books);
      if (old && old.version !== d.version)
        return same && old.version === d.version + 1
          ? reply({ id: old.id, version: old.version })
          : stale();
      if (!old && d.version !== 0) return stale();
      for (const b of books) {
        const retained = old?.books.some(
          (previous) => previous.workId === b.workId,
        );
        if (
          !retained &&
          !(await tx.userBook.findFirst({
            where: {
              userId: session.user.id,
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
        await tx.videoProjectBook.deleteMany({ where: { projectId: d.id } });
      const data = {
        ...fields,
        books: { create: books.map((b, position) => ({ ...b, position })) },
      };
      const saved = old
        ? await tx.videoProject.update({
            where: { id: d.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.videoProject.create({
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
