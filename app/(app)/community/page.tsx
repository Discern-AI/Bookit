import Link from "next/link";
import { ReviewList, reviewPage } from "@/components/community/ReviewList";
export default function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
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
      <ReviewList page={reviewPage(searchParams.page)} basePath="/community" />
    </main>
  );
}
