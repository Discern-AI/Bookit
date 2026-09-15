import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
import { DecideAppeal } from "@/components/community/AppealReview";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string; status?: string };
}) {
  const session = await auth();
  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { isModerator: true },
  });
  if (!me?.isModerator) notFound();
  const page = reviewPage(searchParams.page);
  const resolved = searchParams.status === "resolved";
  const appeals = await prisma.reviewAppeal.findMany({
    where: { status: resolved ? { not: "pending" } : "pending" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      id: true,
      userId: true,
      workId: true,
      reason: true,
      snapshot: true,
      status: true,
      response: true,
      work: { select: { title: true } },
    },
  });
  const rows = await Promise.all(
    appeals
      .slice(0, 20)
      .map(async (appeal) => ({
        appeal,
        latest: resolved
          ? null
          : await prisma.bookReview.findFirst({
              where: { userId: appeal.userId, workId: appeal.workId },
              orderBy: { version: "desc" },
              select: { id: true, body: true, version: true, active: true },
            }),
      })),
  );
  const base = `/community/moderation/appeals?status=${resolved ? "resolved" : "pending"}`;
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link href="/community/moderation" className="underline">
        Moderation reports
      </Link>
      <h1 className="font-display text-3xl">Review appeals</h1>
      <nav className="flex gap-4">
        <Link href="/community/moderation/appeals" className="underline">
          Pending
        </Link>
        <Link
          href="/community/moderation/appeals?status=resolved"
          className="underline"
        >
          Resolved
        </Link>
      </nav>
      {!rows.length && <p>No appeals on this page.</p>}
      {rows.map(({ appeal, latest }) => (
        <article
          key={appeal.id}
          className="border border-ink-200 rounded-lg p-4 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">
            {appeal.work.title}
          </h2>
          <p className="whitespace-pre-wrap break-words">{appeal.reason}</p>
          <details>
            <summary>Review when appealed</summary>
            <p className="whitespace-pre-wrap break-words">
              {appeal.snapshot || "Review text was deleted."}
            </p>
          </details>
          {latest ? (
            <>
              <h3 className="font-medium">Current review</h3>
              <p className="whitespace-pre-wrap break-words">
                {latest.active
                  ? latest.body
                  : "Deleted review. Lifting the restriction will not recreate it."}
              </p>
              <DecideAppeal
                appealId={appeal.id}
                reviewId={latest.id}
                reviewVersion={latest.version}
              />
            </>
          ) : (
            <>
              <p>Status: {appeal.status}</p>
              <p className="whitespace-pre-wrap break-words">
                {appeal.response}
              </p>
            </>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Moderator appeal pages">
        {page > 1 && <Link href={`${base}&page=${page - 1}`}>Previous</Link>}
        {appeals.length > 20 && (
          <Link href={`${base}&page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
