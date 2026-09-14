import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FollowReader } from "@/components/community/FollowReader";
import { reviewPage } from "@/components/community/ReviewList";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  const page = reviewPage(searchParams.page);
  const follows = await prisma.readerFollow.findMany({
    where: { followerId: session!.user.id },
    orderBy: [{ createdAt: "desc" }, { readerId: "asc" }],
    skip: (page - 1) * 20,
    take: 21,
    select: {
      readerId: true,
      reader: {
        select: { profilePublic: true, username: true, publicName: true },
      },
    },
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community?feed=following">
        Following feed
      </Link>
      <h1 className="font-display text-3xl">Readers you follow</h1>
      <p className="text-ink-500">
        Only public profiles appear in your feed. You can unfollow a hidden
        profile here.
      </p>
      {!follows.length && (
        <p>
          You are not following any readers on this page. Find readers through
          reviews in Community.
        </p>
      )}
      {follows.slice(0, 20).map((follow) => (
        <article
          key={follow.readerId}
          className="rounded-lg border border-ink-200 p-4 space-y-3"
        >
          {follow.reader.profilePublic ? (
            <Link
              className="underline break-words"
              href={`/profile/${follow.reader.username}`}
            >
              {follow.reader.publicName}
            </Link>
          ) : (
            <p>Private profile</p>
          )}
          <FollowReader
            key={`${follow.readerId}-following`}
            readerId={follow.readerId}
            initialFollowing={true}
          />
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Following pages">
        {page > 1 && (
          <Link href={`/community/following?page=${page - 1}`}>Previous</Link>
        )}
        {follows.length > 20 && (
          <Link href={`/community/following?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
