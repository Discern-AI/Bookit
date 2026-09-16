import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  const page = reviewPage(searchParams.page);
  const appeals = await prisma.articleAppeal.findMany({
    where: { article: { userId: session!.user.id } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      id: true,
      articleId: true,
      title: true,
      reason: true,
      status: true,
      response: true,
      createdAt: true,
      resolvedAt: true,
      article: { select: { deletedAt: true } },
    },
  });
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <Link href="/creator" className="underline">
        Your articles
      </Link>
      <h1 className="font-display text-3xl">Your article appeals</h1>
      <p>
        Appeal explanations and moderator responses are private. Approved
        appeals leave the article unpublished until you publish it again.
      </p>
      {!appeals.length && <p>No article appeals on this page.</p>}
      {appeals.slice(0, 20).map((a) => (
        <article
          key={a.id}
          className="border border-ink-200 rounded p-4 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">{a.title}</h2>
          <p>
            {a.status} / {a.createdAt.toISOString().slice(0, 10)}
          </p>
          <p className="whitespace-pre-wrap break-words">{a.reason}</p>
          {a.response && (
            <p className="whitespace-pre-wrap break-words">
              Response: {a.response}
            </p>
          )}
          {!a.article.deletedAt && (
            <Link className="underline" href={`/creator/${a.articleId}/edit`}>
              Edit article
            </Link>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Your article appeal pages">
        {page > 1 && (
          <Link href={`/creator/appeals?page=${page - 1}`}>Previous</Link>
        )}
        {appeals.length > 20 && (
          <Link href={`/creator/appeals?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
