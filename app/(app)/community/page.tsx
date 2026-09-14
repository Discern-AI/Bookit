import { auth } from "@/auth";
import Link from "next/link";
import { ReviewList, reviewPage } from "@/components/community/ReviewList";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string; feed?: string };
}) {
  const session = await auth();
  const following = searchParams.feed === "following";
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-4xl">Community</h1>
      <p>
        Reviews shared by Folio readers. Open a book from your library to write
        yours.
      </p>
      <Link className="underline" href="/settings/profile">
        Manage public profile
      </Link>
      <nav aria-label="Community feed" className="flex flex-wrap gap-4">
        <Link
          className="underline"
          aria-current={!following ? "page" : undefined}
          href="/community"
        >
          All reviews
        </Link>
        <Link
          className="underline"
          aria-current={following ? "page" : undefined}
          href="/community?feed=following"
        >
          Following
        </Link>
        <Link className="underline" href="/community/following">
          Readers you follow
        </Link>
      </nav>
      <ReviewList
        followedBy={following ? session!.user.id : undefined}
        page={reviewPage(searchParams.page)}
        basePath={following ? "/community?feed=following" : "/community"}
      />
    </main>
  );
}
