import Link from "next/link";
import { auth } from "@/auth";
import { ArticleList } from "@/components/articles/ArticleList";
import { reviewPage } from "@/components/community/ReviewList";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string; feed?: string };
}) {
  const session = await auth();
  const following = searchParams.feed === "following";
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-4xl">Reader articles</h1>
      <nav className="flex flex-wrap gap-4">
        <Link className="underline" href="/community/articles">
          All articles
        </Link>
        <Link className="underline" href="/community/articles?feed=following">
          Following
        </Link>
        <Link className="underline" href="/creator">
          Your articles
        </Link>
        <Link className="underline" href="/community">
          Reviews
        </Link>
      </nav>
      <ArticleList
        followedBy={following ? session!.user.id : undefined}
        page={reviewPage(searchParams.page)}
        basePath={
          following
            ? "/community/articles?feed=following"
            : "/community/articles"
        }
      />
    </main>
  );
}
