import { ProfileCollections } from "@/components/community/ProfileCollections";
import { auth } from "@/auth";
import { FollowReader } from "@/components/community/FollowReader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReviewList, reviewPage } from "@/components/community/ReviewList";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reader profile | Folio",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { page?: string; tab?: string };
}) {
  const user = await prisma.user.findFirst({
    where: { username: params.username, profilePublic: true },
    select: { id: true, username: true, publicName: true, bio: true },
  });
  if (!user) notFound();
  const tab =
    searchParams.tab === "shelves" || searchParams.tab === "paths"
      ? searchParams.tab
      : "reviews";
  const session = await auth();
  const [following, followersCount, followingCount] = await Promise.all([
    session?.user?.id
      ? prisma.readerFollow.findUnique({
          where: {
            followerId_readerId: {
              followerId: session.user.id,
              readerId: user.id,
            },
          },
          select: { readerId: true },
        })
      : null,
    prisma.readerFollow.count({
      where: { readerId: user.id, follower: { profilePublic: true } },
    }),
    prisma.readerFollow.count({
      where: { followerId: user.id, reader: { profilePublic: true } },
    }),
  ]);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link href="/community">Folio</Link>
      <h1 className="font-display text-4xl break-words">{user.publicName}</h1>
      <p>@{user.username}</p>
      <p className="whitespace-pre-wrap break-words">{user.bio}</p>
      <p className="text-sm text-ink-500">
        {followersCount} public followers &middot; Following {followingCount}{" "}
        public readers
      </p>
      <p className="text-sm text-ink-500">
        Counts include public profiles only. Your following list stays private.
      </p>
      {session?.user?.id === user.id ? (
        <Link className="underline" href="/settings/profile">
          Edit profile
        </Link>
      ) : session?.user?.id ? (
        <FollowReader
          key={`${user.id}-${!!following}`}
          readerId={user.id}
          initialFollowing={!!following}
        />
      ) : (
        <Link className="underline" href="/login">
          Sign in to follow readers
        </Link>
      )}
      <nav aria-label="Profile sections" className="flex flex-wrap gap-4">
        {["reviews", "shelves", "paths"].map((section) => (
          <Link
            className="underline"
            key={section}
            aria-current={tab === section ? "page" : undefined}
            href={`/profile/${user.username}?tab=${section}`}
          >
            {section === "paths"
              ? "Reading paths"
              : section === "shelves"
                ? "Shelves"
                : "Reviews"}
          </Link>
        ))}
      </nav>
      {tab !== "reviews" ? (
        <ProfileCollections
          userId={user.id}
          username={user.username!}
          tab={tab}
          page={reviewPage(searchParams.page)}
        />
      ) : (
        <>
          <h2 className="font-display text-2xl">Published reviews</h2>
          <ReviewList
            userId={user.id}
            page={reviewPage(searchParams.page)}
            basePath={`/profile/${user.username}?tab=reviews`}
          />
        </>
      )}
    </main>
  );
}
