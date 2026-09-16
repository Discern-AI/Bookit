import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { reviewPage } from "@/components/community/ReviewList";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { parseArticleContent } from "@/lib/articles";
import { ModerateArticle } from "@/components/articles/ArticleReportActions";
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
  const reports = await prisma.articleReport.findMany({
    where: { status: resolved ? { not: "pending" } : "pending" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    include: {
      article: {
        select: {
          version: true,
          moderationVersion: true,
          isHidden: true,
          deletedAt: true,
          publishedTitle: true,
          publishedVersion: true,
        },
      },
    },
  });
  const base = `/community/moderation/articles?status=${resolved ? "resolved" : "pending"}`;
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Article moderation</h1>
      <nav className="flex flex-wrap gap-4">
        <Link className="underline" href="/community/moderation">
          Review reports
        </Link>
        <Link className="underline" href="/community/moderation/articles">
          Pending articles
        </Link>
        <Link
          className="underline"
          href="/community/moderation/articles?status=resolved"
        >
          Resolved articles
        </Link>
      </nav>
      <p>
        Private reports contain the published snapshot seen by the reader.
        Deleted image files cannot be restored from a report.
      </p>
      {!reports.length && <p>No article reports on this page.</p>}
      {reports.slice(0, 20).map((r) => (
        <article
          key={r.id}
          className="border border-ink-200 rounded p-5 space-y-4"
        >
          <h2 className="font-display text-2xl">{r.title}</h2>
          <p>Reason: {r.reason}</p>
          <p className="whitespace-pre-wrap break-words">{r.details}</p>
          <p>
            Reported publication: {r.publishedVersion}.{" "}
            {r.article.deletedAt
              ? "Article deleted."
              : r.article.publishedVersion !== r.publishedVersion
                ? "A different published version now exists."
                : "This is the current published version."}
          </p>
          <ArticleContent content={parseArticleContent(r.snapshot)} />
          {r.status === "pending" ? (
            <ModerateArticle
              key={`${r.id}-${r.article.version}`}
              reportId={r.id}
              version={r.article.version}
            />
          ) : (
            <>
              <p className="break-words">
                {r.status}: {r.note}
              </p>
              {r.restoreNote && (
                <p className="break-words">Restoration: {r.restoreNote}</p>
              )}
              {r.status === "hidden" &&
                r.article.isHidden &&
                !r.article.deletedAt &&
                r.decisionVersion === r.article.moderationVersion && (
                  <ModerateArticle
                    key={`${r.id}-${r.article.version}`}
                    reportId={r.id}
                    version={r.article.version}
                    restore
                  />
                )}
            </>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Article report pages">
        {page > 1 && <Link href={`${base}&page=${page - 1}`}>Previous</Link>}
        {reports.length > 20 && (
          <Link href={`${base}&page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
