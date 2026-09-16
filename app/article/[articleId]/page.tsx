import { auth } from "@/auth";
import { ReportArticle } from "@/components/articles/ArticleReportActions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publishedArticles, parseArticleContent } from "@/lib/articles";
import { ArticleContent } from "@/components/articles/ArticleContent";
export const dynamic = "force-dynamic";
export const metadata = { title: "Article | Folio" };
export default async function Page({
  params,
}: {
  params: { articleId: string };
}) {
  const article = await prisma.article.findFirst({
    where: { id: params.articleId, ...publishedArticles },
    select: {
      userId: true,
      publishedVersion: true,
      publishedTitle: true,
      publishedContent: true,
      publishedAt: true,
      publishedReadMinutes: true,
      user: { select: { publicName: true, username: true } },
    },
  });
  if (!article || !article.publishedContent) notFound();
  const session = await auth();
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <Link href="/community/articles" className="underline">
        Folio articles
      </Link>
      <article className="space-y-6">
        <h1 className="font-display text-4xl break-words">
          {article.publishedTitle}
        </h1>
        <p>
          <Link
            className="underline"
            href={`/profile/${article.user.username}?tab=blog`}
          >
            {article.user.publicName}
          </Link>{" "}
          / {article.publishedAt?.toISOString().slice(0, 10)} /{" "}
          {article.publishedReadMinutes} min read
        </p>
        <ArticleContent
          content={parseArticleContent(article.publishedContent)}
        />
      </article>
      {session?.user?.id && session.user.id !== article.userId ? (
        <ReportArticle
          articleId={params.articleId}
          publishedVersion={article.publishedVersion!}
        />
      ) : !session?.user?.id ? (
        <Link className="underline" href="/login">
          Sign in to report an article
        </Link>
      ) : null}
    </main>
  );
}
