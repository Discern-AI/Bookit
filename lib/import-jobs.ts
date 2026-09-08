import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findOrCreateEdition } from "@/lib/library";
import { normalizeIsbn } from "@/lib/isbn";
import type { ImportRow } from "@/lib/goodreads";
export const jobSelect = {
  id: true,
  status: true,
  total: true,
  processed: true,
  imported: true,
  skipped: true,
  errors: true,
  _count: { select: { reviews: { where: { status: "pending" } } } },
} as const;
export async function importEdition(
  db: Prisma.TransactionClient,
  row: ImportRow,
  userId: string,
  editionId: string,
) {
  const existing = await db.userBook.findUnique({
    where: { userId_editionId: { userId, editionId } },
  });
  if (existing) return false;
  const shelves = [];
  for (const name of row.customShelves)
    shelves.push(
      await db.customShelf.upsert({
        where: { userId_name: { userId, name } },
        update: {},
        create: { userId, name },
      }),
    );
  await db.userBook.create({
    data: {
      userId,
      editionId,
      shelf: row.shelf,
      rating: row.rating,
      dateAdded: row.dateAdded ? new Date(row.dateAdded) : undefined,
      dateFinished: row.dateFinished ? new Date(row.dateFinished) : null,
      privateNotes: row.privateNotes || null,
      importedReview: row.importedReview || null,
      customShelves: { connect: shelves.map((s) => ({ id: s.id })) },
    },
  });
  return true;
}
export async function advanceImport(id: string, userId: string) {
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const job = await db.importJob.findFirst({ where: { id, userId } });
      if (!job) return null;
      if (job.status === "complete")
        return db.importJob.findUnique({ where: { id }, select: jobSelect });
      const rows = job.rows as unknown as ImportRow[];
      let imported = job.imported;
      let skipped = job.skipped;
      const batch = rows.slice(job.processed, job.processed + 25);
      for (const [index, row] of batch.entries()) {
        const candidates = normalizeIsbn(row.isbn13)
          ? []
          : await db.edition.findMany({
              where: {
                work: {
                  title: { equals: row.title, mode: "insensitive" },
                  authorName: { equals: row.author, mode: "insensitive" },
                },
              },
              select: { id: true },
              orderBy: { id: "asc" },
            });
        if (candidates.length > 1) {
          await db.importReview.create({
            data: {
              jobId: id,
              rowIndex: job.processed + index,
              row: JSON.parse(JSON.stringify(row)),
              candidateIds: candidates.map((c) => c.id),
            },
          });
          continue;
        }
        const edition = candidates[0] ?? (await findOrCreateEdition(row, db));
        if (await importEdition(db, row, userId, edition.id)) imported++;
        else skipped++;
      }
      const processed = job.processed + batch.length;
      return db.importJob.update({
        where: { id },
        data: {
          processed,
          imported,
          skipped,
          status: processed >= job.total ? "complete" : "queued",
          ...(processed >= job.total ? { rows: [] } : {}),
        },
        select: jobSelect,
      });
    },
    { timeout: 25000, maxWait: 10000 },
  );
}
