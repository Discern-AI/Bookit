import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { parseArticleContent } from "@/lib/articles";
import { DecideArticleAppeal } from "@/components/articles/ArticleAppealActions";
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
  const appeals = await prisma.articleAppeal.findMany({
    where: { status: resolved ? { not: "pending" } : "pending" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    include: {
      article: {
        select: {
          version: true,
          moderationVersion: true,
          deletedAt: true,
          isHidden: true,
        },
      },
    },
  });
  const base = `/community/moderation/article-appeals?status=${resolved ? "resolved" : "pending"}`;
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Article appeals</h1>
      <nav className="flex flex-wrap gap-4">
        <Link className="underline" href="/community/moderation/articles">
          Article reports
        </Link>
        <Link
          className="underline"
          href="/community/moderation/article-appeals"
        >
          Pending appeals
        </Link>
        <Link
          className="underline"
          href="/community/moderation/article-appeals?status=resolved"
        >
          Resolved appeals
        </Link>
      </nav>
      <p>
        Authors share their explanation and hidden published snapshot.
        Unpublished draft edits are not included. Approval lifts the restriction
        but leaves the article unpublished.
      </p>
      {!appeals.length && <p>No article appeals on this page.</p>}
      {appeals.slice(0, 20).map((a) => (
        <article
          key={a.id}
          className="border border-ink-200 rounded p-5 space-y-4"
        >
          <h2 className="font-display text-2xl break-words">{a.title}</h2>
          <p className="whitespace-pre-wrap break-words">{a.reason}</p>
          <ArticleContent content={parseArticleContent(a.snapshot)} />
          {a.article.deletedAt && (
            <p>Article deleted; its image files are no longer available.</p>
          )}
          {a.status === "pending" &&
          !a.article.deletedAt &&
          a.article.isHidden &&
          a.article.moderationVersion === a.moderationVersion ? (
            <DecideArticleAppeal
              key={`${a.id}-${a.article.version}`}
              appealId={a.id}
              version={a.article.version}
            />
          ) : (
            <>
              <p>{a.status}</p>
              {a.response && (
                <p className="whitespace-pre-wrap break-words">
                  Response: {a.response}
                </p>
              )}
            </>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Article appeal pages">
        {page > 1 && <Link href={`${base}&page=${page - 1}`}>Previous</Link>}
        {appeals.length > 20 && (
          <Link href={`${base}&page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
