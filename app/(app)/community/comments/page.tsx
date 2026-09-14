import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
import { RemoveComment } from "@/components/community/DiscussionActions";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  const page = reviewPage(searchParams.page);
  const comments = await prisma.reviewComment.findMany({
    where: { userId: session!.user.id, isHidden: false },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      id: true,
      body: true,
      review: {
        select: {
          id: true,
          isPublic: true,
          isHidden: true,
          user: { select: { profilePublic: true } },
          work: { select: { title: true } },
        },
      },
    },
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community">
        Community
      </Link>
      <h1 className="font-display text-3xl">Your comments</h1>
      <p>
        Manage your comments here, including comments on reviews that are no
        longer public.
      </p>
      {!comments.length && <p>No comments on this page.</p>}
      {comments.slice(0, 20).map((comment) => (
        <article
          key={comment.id}
          className="border border-ink-200 rounded-lg p-4 space-y-3"
        >
          {comment.review.isPublic &&
          !comment.review.isHidden &&
          comment.review.user.profilePublic ? (
            <Link className="underline" href={`/review/${comment.review.id}`}>
              {comment.review.work.title}
            </Link>
          ) : (
            <p>Review no longer public</p>
          )}
          <p className="whitespace-pre-wrap break-words">{comment.body}</p>
          <RemoveComment commentId={comment.id} />
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Your comment pages">
        {page > 1 && (
          <Link href={`/community/comments?page=${page - 1}`}>Previous</Link>
        )}
        {comments.length > 20 && (
          <Link href={`/community/comments?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
