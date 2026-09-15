import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { publishedArticles, articleCardSelect } from "@/lib/articles";
export async function ArticleList({
  userId,
  followedBy,
  page = 1,
  basePath,
}: {
  userId?: string;
  followedBy?: string;
  page?: number;
  basePath: string;
}) {
  const articles = await prisma.article.findMany({
    where: {
      ...publishedArticles,
      ...(userId ? { userId } : {}),
      ...(followedBy
        ? {
            user: {
              profilePublic: true,
              blogEnabled: true,
              readerFollowers: { some: { followerId: followedBy } },
            },
          }
        : {}),
    },
    select: articleCardSelect,
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
  });
  return (
    <div className="space-y-4">
      {!articles.length && <p>No published articles on this page.</p>}
      {articles.slice(0, 20).map((article) => (
        <article
          key={article.id}
          className="border border-ink-200 rounded-lg p-5 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">
            <Link className="underline" href={`/article/${article.id}`}>
              {article.publishedTitle}
            </Link>
          </h2>
          <p className="text-ink-500 break-words">{article.publishedExcerpt}</p>
          <p className="text-sm text-ink-500">
            <Link
              className="underline"
              href={`/profile/${article.user.username}?tab=blog`}
            >
              {article.user.publicName}
            </Link>{" "}
            / {article.publishedAt?.toISOString().slice(0, 10)} /{" "}
            {article.publishedReadMinutes} min read
          </p>
        </article>
      ))}
      <nav aria-label="Article pages" className="flex gap-4">
        {page > 1 && (
          <Link
            href={`${basePath}${basePath.includes("?") ? "&" : "?"}page=${page - 1}`}
          >
            Previous
          </Link>
        )}
        {articles.length > 20 && (
          <Link
            href={`${basePath}${basePath.includes("?") ? "&" : "?"}page=${page + 1}`}
          >
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}
