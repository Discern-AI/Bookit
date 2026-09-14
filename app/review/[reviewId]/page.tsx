import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { publishedReviews, reviewSelect } from "@/lib/community";
import { reviewPage } from "@/components/community/ReviewList";
import {
  DiscussionActions,
  ReportContent,
  RemoveComment,
} from "@/components/community/DiscussionActions";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Review discussion | Folio",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: { reviewId: string };
  searchParams: { page?: string };
}) {
  const review = await prisma.bookReview.findFirst({
    where: { id: params.reviewId, ...publishedReviews },
    select: reviewSelect,
  });
  if (!review) notFound();
  const session = await auth();
  const userId = session?.user?.id;
  const page = reviewPage(searchParams.page);
  const [comments, likeCount, like, me] = await Promise.all([
    prisma.reviewComment.findMany({
      where: {
        reviewId: review.id,
        isHidden: false,
        user: { profilePublic: true },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * 20,
      take: 21,
      select: {
        id: true,
        body: true,
        userId: true,
        user: { select: { publicName: true, username: true } },
      },
    }),
    prisma.reviewLike.count({ where: { reviewId: review.id } }),
    userId
      ? prisma.reviewLike.findUnique({
          where: { userId_reviewId: { userId, reviewId: review.id } },
          select: { userId: true },
        })
      : null,
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { profilePublic: true },
        })
      : null,
  ]);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link href="/community" className="underline">
        Community
      </Link>
      <article className="space-y-3">
        <h1 className="font-display text-3xl break-words">
          Review of{" "}
          <Link className="underline" href={`/book/${review.work.id}`}>
            {review.work.title}
          </Link>
        </h1>
        <Link className="underline" href={`/profile/${review.user.username}`}>
          {review.user.publicName}
        </Link>
        {review.rating !== null && <p>{review.rating} / 5</p>}
        <p className="whitespace-pre-wrap break-words">{review.body}</p>
      </article>
      {userId ? (
        <>
          <DiscussionActions
            reviewId={review.id}
            liked={!!like}
            likeCount={likeCount}
            canComment={!!me?.profilePublic}
          />
          <ReportContent reviewId={review.id} />
          <Link className="underline block" href="/community/comments">
            Manage your comments
          </Link>
        </>
      ) : (
        <p>
          {likeCount} likes.{" "}
          <Link className="underline" href="/login">
            Sign in to join the discussion
          </Link>
          .
        </p>
      )}
      <h2 className="font-display text-2xl">Comments</h2>
      {!comments.length && <p>No public comments on this page.</p>}
      {comments.slice(0, 20).map((comment) => (
        <article
          key={comment.id}
          className="rounded-lg border border-ink-200 p-4 space-y-3"
        >
          <Link
            className="underline"
            href={`/profile/${comment.user.username}`}
          >
            {comment.user.publicName}
          </Link>
          <p className="whitespace-pre-wrap break-words">{comment.body}</p>
          {userId && (
            <div className="flex flex-wrap gap-2">
              <ReportContent reviewId={review.id} commentId={comment.id} />
              {comment.userId === userId && (
                <RemoveComment commentId={comment.id} />
              )}
            </div>
          )}
        </article>
      ))}
      <nav aria-label="Comment pages" className="flex gap-4">
        {page > 1 && (
          <Link href={`/review/${review.id}?page=${page - 1}`}>Previous</Link>
        )}
        {comments.length > 20 && (
          <Link href={`/review/${review.id}?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
