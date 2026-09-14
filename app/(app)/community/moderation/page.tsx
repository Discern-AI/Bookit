import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
import { ModerateReport } from "@/components/community/DiscussionActions";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string; status?: string };
}) {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { isModerator: true },
  });
  if (!user?.isModerator) notFound();
  const page = reviewPage(searchParams.page);
  const resolved = searchParams.status === "resolved";
  const reports = await prisma.reviewReport.findMany({
    where: { status: resolved ? { not: "pending" } : "pending" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      id: true,
      reason: true,
      details: true,
      snapshot: true,
      commentId: true,
      status: true,
      resolvedAt: true,
      review: { select: { work: { select: { title: true } } } },
    },
  });
  const base = `/community/moderation?status=${resolved ? "resolved" : "pending"}`;
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Moderation reports</h1>
      <nav className="flex gap-4">
        <Link className="underline" href="/community/moderation">
          Pending
        </Link>
        <Link
          className="underline"
          href="/community/moderation?status=resolved"
        >
          Resolved
        </Link>
      </nav>
      <p>
        Reports are private. Content below is the snapshot recorded when
        reported.
      </p>
      {!reports.length && <p>No reports on this page.</p>}
      {reports.slice(0, 20).map((report) => (
        <article
          key={report.id}
          className="border border-ink-200 rounded-lg p-4 space-y-3"
        >
          <h2 className="font-display text-xl">
            {report.commentId ? "Comment" : "Review"}:{" "}
            {report.review.work.title}
          </h2>
          <p>Reason: {report.reason}</p>
          <p className="whitespace-pre-wrap break-words">{report.details}</p>
          <blockquote className="border-l-2 border-ink-200 pl-3 whitespace-pre-wrap break-words">
            {report.snapshot}
          </blockquote>
          {report.status === "pending" ? (
            <ModerateReport reportId={report.id} />
          ) : (
            <p>
              {report.status} on {report.resolvedAt?.toISOString().slice(0, 10)}
            </p>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Report pages">
        {page > 1 && <Link href={`${base}&page=${page - 1}`}>Previous</Link>}
        {reports.length > 20 && (
          <Link href={`${base}&page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
