import { AppealArticle } from "@/components/articles/ArticleAppealActions";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BlogSettings } from "@/components/articles/BlogSettings";
import { reviewPage } from "@/components/community/ReviewList";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    select: { blogEnabled: true, blogVersion: true, profilePublic: true },
  });
  const page = reviewPage(searchParams.page);
  const articles = await prisma.article.findMany({
    where: { userId: session!.user.id, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
  });
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-4xl">Your articles</h1>
      <Link href="/creator/cards" className="underline">
        Make shareable cards
      </Link>
      <Link href="/creator/appeals" className="underline">
        Your article appeals
      </Link>
      <Link href="/community/reviews" className="underline">
        Start from a review
      </Link>
      <p>
        Write privately and publish when you are ready. Your public blog is{" "}
        {user.blogEnabled ? "enabled" : "disabled"}.
      </p>
      <BlogSettings
        key={user.blogVersion}
        enabled={user.blogEnabled}
        version={user.blogVersion}
      />
      {!user.profilePublic && (
        <p>
          <Link className="underline" href="/settings/profile">
            Make your profile public
          </Link>{" "}
          before publishing articles.
        </p>
      )}
      <p>
        <Link className="underline" href="/creator/new">
          New article
        </Link>
      </p>
      {!articles.length && <p>No saved articles on this page.</p>}
      {articles.slice(0, 20).map((a) => (
        <article
          className="border border-ink-200 rounded p-4 space-y-2"
          key={a.id}
        >
          <h2 className="font-display text-2xl break-words">
            <Link href={`/creator/${a.id}/edit`} className="underline">
              {a.title}
            </Link>
          </h2>
          {a.isHidden && (
            <AppealArticle
              articleId={a.id}
              moderationVersion={a.moderationVersion}
            />
          )}
          <p>
            {a.isHidden
              ? "Hidden by moderation"
              : a.isPublic
                ? user.blogEnabled && user.profilePublic
                  ? "Published"
                  : "Published version hidden by your settings"
                : "Private draft"}
            {a.isPublic && a.publishedVersion !== a.version
              ? " / Unpublished changes"
              : ""}
          </p>
          {!a.isHidden &&
            a.isPublic &&
            user.blogEnabled &&
            user.profilePublic && (
              <Link href={`/article/${a.id}`} className="underline">
                View published article
              </Link>
            )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Your article pages">
        {page > 1 && <Link href={`/creator?page=${page - 1}`}>Previous</Link>}
        {articles.length > 20 && (
          <Link href={`/creator?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
