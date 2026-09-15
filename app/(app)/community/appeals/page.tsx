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
  const appeals = await prisma.reviewAppeal.findMany({
    where: { userId: session!.user.id },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      id: true,
      reason: true,
      status: true,
      response: true,
      work: { select: { title: true } },
    },
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community/reviews">
        Your reviews
      </Link>
      <h1 className="font-display text-3xl">Your appeals</h1>
      <p>
        Appeals and moderator responses are private. You can appeal a hidden
        review from Your reviews.
      </p>
      {!appeals.length && <p>No appeals on this page.</p>}
      {appeals.slice(0, 20).map((appeal) => (
        <article
          key={appeal.id}
          className="border border-ink-200 rounded-lg p-4 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">
            {appeal.work.title}
          </h2>
          <p>Status: {appeal.status}</p>
          <p className="whitespace-pre-wrap break-words">{appeal.reason}</p>
          {appeal.response && (
            <p className="whitespace-pre-wrap break-words">
              Moderator response: {appeal.response}
            </p>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Appeal pages">
        {page > 1 && (
          <Link href={`/community/appeals?page=${page - 1}`}>Previous</Link>
        )}
        {appeals.length > 20 && (
          <Link href={`/community/appeals?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
