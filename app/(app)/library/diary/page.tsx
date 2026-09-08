import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ReadingDiary } from "@/components/library/ReadingDiary";
export default async function DiaryPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [sessions, books, user] = await Promise.all([
    prisma.readingSession.findMany({
      where: { userId: session.user.id },
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
        edition: {
          select: { pageCount: true, work: { select: { title: true } } },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { yearlyGoal: true, goalYear: true },
    }),
  ]);
  return (
    <ReadingDiary
      sessions={sessions.map((s) => ({
        id: s.id,
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
        title: b.edition.work.title,
        pageCount: b.edition.pageCount,
        shelf: b.shelf,
        rating: b.rating,
        dateFinished: b.dateFinished?.toISOString() ?? null,
      }))}
      goal={user?.yearlyGoal ?? null}
      goalYear={user?.goalYear ?? null}
    />
  );
}
