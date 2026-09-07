import { prisma } from "@/lib/prisma";
import { findOrCreateEdition } from "@/lib/library";
import type { ImportRow } from "@/lib/goodreads";
export const jobSelect = {
  id: true,
  status: true,
  total: true,
  processed: true,
  imported: true,
  skipped: true,
  errors: true,
} as const;
export async function advanceImport(id: string, userId: string) {
  return prisma.$transaction(
    async (db) => {
      // Serialise all library additions for this user, including other tabs/import jobs.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const job = await db.importJob.findFirst({ where: { id, userId } });
      if (!job) return null;
      if (job.status === "complete")
        return db.importJob.findUnique({ where: { id }, select: jobSelect });
      const rows = job.rows as unknown as ImportRow[];
      let imported = job.imported;
      let skipped = job.skipped;
      const batch = rows.slice(job.processed, job.processed + 25);
      for (const row of batch) {
        const edition = await findOrCreateEdition(row, db);
        const existing = await db.userBook.findUnique({
          where: { userId_editionId: { userId, editionId: edition.id } },
        });
        if (existing) {
          skipped++;
          continue;
        }
        const customShelves = [];
        for (const name of row.customShelves) {
          const shelf = await db.customShelf.upsert({
            where: { userId_name: { userId, name } },
            update: {},
            create: { userId, name },
          });
          customShelves.push({ id: shelf.id });
        }
        await db.userBook.create({
          data: {
            userId,
            editionId: edition.id,
            shelf: row.shelf,
            rating: row.rating,
            dateAdded: row.dateAdded ? new Date(row.dateAdded) : undefined,
            dateFinished: row.dateFinished ? new Date(row.dateFinished) : null,
            privateNotes: row.privateNotes || null,
            importedReview: row.importedReview || null,
            customShelves: { connect: customShelves },
          },
        });
        imported++;
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
