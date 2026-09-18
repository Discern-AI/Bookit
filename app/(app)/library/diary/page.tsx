import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ReadingDiary } from "@/components/library/ReadingDiary";
export default async function DiaryPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [sessions, books, user, cycles] = await Promise.all([
    prisma.readingSession.findMany({
      where: { userId: session.user.id, deletedAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        userBook: { include: { edition: { include: { work: true } } } },
      },
    }),
    prisma.userBook.findMany({
      where: {
        userId: session.user.id,
        shelf: { in: ["reading_now", "read"] },
      },
      select: {
        id: true,
        shelf: true,
        rating: true,
        dateFinished: true,
        readingCycles: { where: { isCurrent: true }, select: { id: true } },
        edition: {
          select: { pageCount: true, work: { select: { title: true } } },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { yearlyGoal: true, goalYear: true },
    }),
    prisma.readingCycle.findMany({
      where: { userBook: { userId: session.user.id }, cancelledAt: null },
      include: {
        userBook: { include: { edition: { include: { work: true } } } },
      },
    }),
  ]);
  return (
    <ReadingDiary
      sessions={sessions.map((s) => ({
        id: s.id,
        version: s.version,
        cycleId: s.cycleId,
        date: s.date.toISOString(),
        pageStart: s.pageStart,
        pageEnd: s.pageEnd,
        timeStart: s.timeStart?.toISOString() ?? null,
        timeEnd: s.timeEnd?.toISOString() ?? null,
        note: s.note,
        userBookId: s.userBookId,
        title: s.userBook.edition.work.title,
      }))}
      books={books.map((b) => ({
        id: b.id,
        cycleId: b.readingCycles[0]?.id ?? null,
        title: b.edition.work.title,
        pageCount: b.edition.pageCount,
        shelf: b.shelf,
        rating: b.rating,
        dateFinished: b.dateFinished?.toISOString() ?? null,
      }))}
      completions={[
        ...cycles
          .filter((c) => c.dateFinished)
          .map((c) => ({
            id: c.id,
            title: c.userBook.edition.work.title,
            dateFinished: c.dateFinished!.toISOString(),
            rating: c.userBook.rating,
          })),
        ...books
          .filter((b) => !b.readingCycles.length && b.dateFinished)
          .map((b) => ({
            id: b.id,
            title: b.edition.work.title,
            dateFinished: b.dateFinished!.toISOString(),
            rating: b.rating,
          })),
      ]}
      goal={user?.yearlyGoal ?? null}
      goalYear={user?.goalYear ?? null}
    />
  );
}
