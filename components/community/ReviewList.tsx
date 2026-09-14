import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { publishedReviews, reviewSelect } from "@/lib/community";
export async function ReviewList({
  workId,
  followedBy,
  userId,
  page = 1,
  basePath,
}: {
  workId?: string;
  followedBy?: string;
  userId?: string;
  page?: number;
  basePath: string;
}) {
  const reviews = await prisma.bookReview.findMany({
    where: {
      ...publishedReviews,
      ...(followedBy
        ? {
            user: {
              profilePublic: true,
              readerFollowers: { some: { followerId: followedBy } },
            },
          }
        : {}),
      ...(workId ? { workId } : {}),
      ...(userId ? { userId } : {}),
    },
    select: reviewSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 21,
    skip: (page - 1) * 20,
  });
  return (
    <div className="space-y-4">
      {!reviews.length && (
        <p className="text-ink-500">
          {followedBy
            ? "No published reviews from readers you follow yet. Explore Community to find readers."
            : "No published reviews yet."}
        </p>
      )}
      {reviews.slice(0, 20).map((review) => (
        <article
          key={review.id}
          className="rounded-lg border border-ink-200 p-5 space-y-2"
        >
          <p>
            <Link
              className="text-shelf-700 underline"
              href={`/profile/${review.user.username}`}
            >
              {review.user.publicName}
            </Link>{" "}
            reviewed{" "}
            <Link className="underline" href={`/book/${review.work.id}`}>
              {review.work.title}
            </Link>
          </p>
          {review.rating !== null && (
            <p aria-label={`Rating: ${review.rating} out of 5`}>
              {review.rating} / 5
            </p>
          )}
          <p className="whitespace-pre-wrap break-words">{review.body}</p>
          <p className="text-sm text-ink-500">
            Updated {review.updatedAt.toISOString().slice(0, 10)}
          </p>
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Review pages">
        {page > 1 && (
          <Link
            href={`${basePath}${basePath.includes("?") ? "&" : "?"}page=${page - 1}`}
          >
            Previous
          </Link>
        )}
        {reviews.length > 20 && (
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
export function reviewPage(value?: string) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 10000 ? n : 1;
}
