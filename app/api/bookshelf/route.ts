import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sameOriginJson } from "@/lib/book-journal";
import type { ShelfVolume } from "@/lib/bookshelf";
export async function GET() {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const [books, user] = await Promise.all([
    prisma.userBook.findMany({
      where: { userId: session.user.id },
      include: {
        edition: { include: { work: true } },
        readingCycles: {
          where: { cancelledAt: null },
          orderBy: { number: "asc" },
        },
      },
      orderBy: [{ dateAdded: "asc" }, { id: "asc" }],
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { showUpNext: true },
    }),
  ]);
  const volumes: ShelfVolume[] = [];
  for (const b of books) {
    const base = {
      bookId: b.id,
      workId: b.edition.workId,
      title: b.edition.editionTitle ?? b.edition.work.title,
      author: b.edition.work.authorName,
      coverUrl: b.edition.coverUrl,
    };
    const completed = b.readingCycles.filter(
      (c) => c.dateFinished || !c.isCurrent || b.shelf === "read",
    );
    for (const c of completed)
      volumes.push({
        ...base,
        key: c.id,
        cycle: c.number,
        date: c.dateFinished?.toISOString() ?? null,
        section: "read",
      });
    if (!b.readingCycles.length && b.shelf === "read")
      volumes.push({
        ...base,
        key: `legacy-${b.id}`,
        cycle: 1,
        date: b.dateFinished?.toISOString() ?? null,
        section: "read",
      });
    const current = b.readingCycles.find((c) => c.isCurrent);
    if (b.shelf === "reading_now" && !current?.dateFinished)
      volumes.push({
        ...base,
        key: `current-${b.id}`,
        cycle: current?.number ?? 1,
        date: b.dateStarted?.toISOString() ?? null,
        section: "current",
      });
    if (
      b.shelfPinned &&
      ["tbr", "owned_unread", "wishlist", "interested"].includes(b.shelf)
    )
      volumes.push({
        ...base,
        key: `next-${b.id}`,
        cycle: 0,
        date: null,
        section: "next",
      });
  }
  const order = { read: 0, current: 1, next: 2 };
  volumes.sort(
    (a, b) =>
      order[a.section] - order[b.section] ||
      (a.date ?? "").localeCompare(b.date ?? "") ||
      a.key.localeCompare(b.key),
  );
  return Response.json(
    {
      volumes,
      showUpNext: user.showUpNext,
      choices: books.map((b) => ({
        id: b.id,
        workId: b.edition.workId,
        title: b.edition.work.title,
        shelf: b.shelf,
        pinned: b.shelfPinned,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!sameOriginJson(request))
    return Response.json({ error: "Use Folio on this site." }, { status: 403 });
  const parsed = z
    .object({ showUpNext: z.boolean() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Choose whether to show Up next." },
      { status: 400 },
    );
  await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
  });
  return Response.json(parsed.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
