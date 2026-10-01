import { prisma } from "@/lib/prisma";
import {
  bingoLines,
  challengeMatches,
  type Completion,
} from "@/lib/challenges";
export async function readingChallenges(userId: string) {
  const [challenges, books] = await Promise.all([
    prisma.readingChallenge.findMany({
      where: { userId, deletedAt: null },
      include: {
        squares: {
          orderBy: { position: "asc" },
          include: { work: { select: { title: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    prisma.userBook.findMany({
      where: { userId },
      include: { edition: { include: { work: true } }, readingCycles: true },
    }),
  ]);
  const reads: Completion[] = [];
  for (const b of books) {
    const dates = b.readingCycles.length
      ? b.readingCycles
          .filter((c) => !c.cancelledAt && c.dateFinished)
          .map((c) => ({ date: c.dateFinished!, cycleId: c.id }))
      : b.shelf === "read" && b.dateFinished
        ? [{ date: b.dateFinished, cycleId: null }]
        : [];
    for (const d of dates)
      reads.push({
        workId: b.edition.workId,
        userBookId: b.id,
        cycleId: d.cycleId,
        title: b.edition.work.title,
        genres: b.edition.work.genres,
        date: d.date.toISOString().slice(0, 10),
      });
  }
  return challenges.map((c) => {
    const eligible = challengeMatches(c, reads);
    const squares = c.squares.map((s) => ({
      ...s,
      completion: eligible.find((r) => r.workId === s.workId) ?? null,
    }));
    const completions =
      c.kind === "bingo"
        ? squares.flatMap((s) => (s.completion ? [s.completion] : []))
        : eligible;
    return {
      ...c,
      squares,
      completions,
      lines: bingoLines(squares.map((s) => !!s.completion)),
    };
  });
}
