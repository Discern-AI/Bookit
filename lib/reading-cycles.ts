import type { Prisma } from "@prisma/client";
// Caller holds the existing per-user reading mutation lock.
export async function ensureReadingCycle(
  db: Prisma.TransactionClient,
  book: { id: string; dateStarted: Date | null; dateFinished: Date | null },
) {
  const current = await db.readingCycle.findFirst({
    where: { userBookId: book.id, isCurrent: true },
  });
  if (current) return current;
  const created = await db.readingCycle.create({
    data: {
      userBookId: book.id,
      number: 1,
      dateStarted: book.dateStarted,
      dateFinished: book.dateFinished,
    },
  });
  await db.readingSession.updateMany({
    where: { userBookId: book.id, cycleId: null },
    data: { cycleId: created.id },
  });
  return created;
}
