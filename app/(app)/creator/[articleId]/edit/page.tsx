import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/articles/ArticleEditor";
import { parseArticleContent } from "@/lib/articles";
export default async function Page({
  params,
  searchParams,
}: {
  params: { articleId: string };
  searchParams: { saved?: string };
}) {
  const session = await auth();
  const article = await prisma.article.findFirst({
    where: { id: params.articleId, userId: session!.user.id, deletedAt: null },
  });
  if (!article) notFound();
  return (
    <ArticleEditor
      savedNotice={searchParams.saved === "1"}
      key={article.id}
      userId={session!.user.id}
      initial={{
        id: article.id,
        isHidden: article.isHidden,
        title: article.title,
        excerpt: article.excerpt,
        content: parseArticleContent(article.content),
        version: article.version,
        isPublic: article.isPublic,
        publishedVersion: article.publishedVersion,
      }}
    />
  );
}
