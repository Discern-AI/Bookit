import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ImportRow } from "@/lib/goodreads";
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pending = await prisma.importReview.findMany({
    where: { job: { userId: session.user.id }, status: "pending" },
    orderBy: [{ jobId: "asc" }, { rowIndex: "asc" }],
    take: 50,
  });
  const editions = await prisma.edition.findMany({
    where: { id: { in: pending.flatMap((r) => r.candidateIds) } },
    select: {
      id: true,
      publisher: true,
      year: true,
      format: true,
      isbn13: true,
      work: { select: { title: true, authorName: true } },
    },
  });
  return NextResponse.json({
    reviews: pending.map((r) => ({
      id: r.id,
      title: (r.row as unknown as ImportRow).title,
      author: (r.row as unknown as ImportRow).author,
      candidates: editions.filter((e) => r.candidateIds.includes(e.id)),
    })),
  });
}
