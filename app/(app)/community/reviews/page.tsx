import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
import { DeleteReview } from "@/components/community/DeleteReview";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; q?: string };
}) {
  const session = await auth();
  const userId = session!.user.id;
  const page = reviewPage(searchParams.page);
  const status = ["drafts", "published", "hidden"].includes(
    searchParams.status ?? "",
  )
    ? searchParams.status!
    : "all";
  const q = (searchParams.q ?? "").trim().slice(0, 200);
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { profilePublic: true },
  });
  const where: Prisma.BookReviewWhereInput = {
    userId,
    active: true,
    deletedAt: null,
    ...(status === "drafts"
      ? { isPublic: false, isHidden: false }
      : status === "published"
        ? { isPublic: true, isHidden: false }
        : status === "hidden"
          ? { isHidden: true }
          : {}),
    ...(q
      ? {
          work: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { authorName: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const reviews = await prisma.bookReview.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      id: true,
      workId: true,
      body: true,
      rating: true,
      isPublic: true,
      isHidden: true,
      version: true,
      work: { select: { title: true, authorName: true } },
    },
  });
  const query = new URLSearchParams({ status, ...(q ? { q } : {}) });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community">
        Community
      </Link>
      <h1 className="font-display text-3xl">Your reviews</h1>
      <p>
        Private drafts and reviews you have chosen to publish.{" "}
        <Link className="underline" href="/library">
          Open a library book
        </Link>{" "}
        to start a new review.
      </p>
      {!me.profilePublic && (
        <p className="text-ink-500">
          Your profile is private, so your published reviews are currently
          hidden from other readers.
        </p>
      )}
      <nav aria-label="Your review filters" className="flex flex-wrap gap-4">
        {["all", "drafts", "published", "hidden"].map((tab) => (
          <Link
            key={tab}
            className="underline capitalize"
            aria-current={status === tab ? "page" : undefined}
            href={`/community/reviews?${new URLSearchParams({ status: tab, ...(q ? { q } : {}) })}`}
          >
            {tab === "hidden" ? "Moderator hidden" : tab}
          </Link>
        ))}
      </nav>
      <form className="flex gap-2" action="/community/reviews">
        <input type="hidden" name="status" value={status} />
        <input
          aria-label="Search your reviews"
          name="q"
          defaultValue={q}
          maxLength={200}
          placeholder="Book title or author"
          className="min-w-0 flex-1 border border-ink-200 rounded p-2 bg-paper-50"
        />
        <button type="submit" className="text-shelf-700 underline">
          Search
        </button>
      </form>
      {!reviews.length && (
        <p>No reviews match this page. Try another filter or search.</p>
      )}
      {reviews.slice(0, 20).map((review) => (
        <article
          key={review.id}
          className="border border-ink-200 rounded-lg p-4 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">
            {review.work.title}
          </h2>
          <p className="text-ink-500">{review.work.authorName}</p>
          <p className="text-sm">
            {review.isHidden
              ? "Hidden by a moderator"
              : review.isPublic
                ? me.profilePublic
                  ? "Published"
                  : "Published - profile private"
                : "Private draft"}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {review.body.length > 400
              ? `${review.body.slice(0, 400)}...`
              : review.body}
          </p>
          {review.rating !== null && <p>{review.rating} / 5</p>}
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className="underline"
              href={`/community/review/${review.workId}`}
            >
              Edit review
            </Link>
            {review.isPublic && !review.isHidden && me.profilePublic && (
              <Link className="underline" href={`/review/${review.id}`}>
                View discussion
              </Link>
            )}
            <DeleteReview
              id={review.id}
              workId={review.workId}
              version={review.version}
              title={review.work.title}
            />
          </div>
        </article>
      ))}
      <nav aria-label="Your review pages" className="flex gap-4">
        {page > 1 && (
          <Link href={`/community/reviews?${query}&page=${page - 1}`}>
            Previous
          </Link>
        )}
        {reviews.length > 20 && (
          <Link href={`/community/reviews?${query}&page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </main>
  );
}
