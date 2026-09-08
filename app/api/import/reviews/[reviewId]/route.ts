import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { importEdition, jobSelect } from "@/lib/import-jobs";
import type { ImportRow } from "@/lib/goodreads";
export async function POST(
  request: Request,
  { params }: { params: { reviewId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({ choice: z.string().min(1).max(100) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose an edition or skip this row." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const review = await db.importReview.findFirst({
      where: { id: params.reviewId, job: { userId: session.user.id } },
    });
    if (!review) return { error: "Review not found.", status: 404 };
    if (review.status !== "pending")
      return { error: "This row has already been reviewed.", status: 409 };
    const row = review.row as unknown as ImportRow;
    const choice = parsed.data.choice;
    if (
      choice !== "skip" &&
      choice !== "separate" &&
      !review.candidateIds.includes(choice)
    )
      return { error: "Choose one of the suggested editions.", status: 400 };
    let imported = false;
    if (choice !== "skip") {
      const edition =
        choice === "separate"
          ? await db.edition.create({
              data: {
                format: "paperback",
                year: row.year,
                pageCount: row.pageCount,
                work: {
                  create: {
                    title: row.title,
                    authorName: row.author,
                    genres: [],
                    themes: [],
                    embedding: [],
                  },
                },
              },
            })
          : await db.edition.findUnique({ where: { id: choice } });
      if (!edition)
        return { error: "That edition is no longer available.", status: 409 };
      imported = await importEdition(db, row, session.user.id, edition.id);
    }
    await db.importReview.update({
      where: { id: review.id },
      data: { status: choice === "skip" ? "skipped" : "resolved", row: {} },
    });
    const job = await db.importJob.update({
      where: { id: review.jobId },
      data: {
        imported: { increment: imported ? 1 : 0 },
        skipped: { increment: imported ? 0 : 1 },
      },
      select: jobSelect,
    });
    return { job, status: 200 };
  });
  return NextResponse.json(result, { status: result.status });
}
