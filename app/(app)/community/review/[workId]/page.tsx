import { AppealReview } from "@/components/community/AppealReview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PublishingForm } from "@/components/community/PublishingForm";
export default async function Page({ params }: { params: { workId: string } }) {
  const session = await auth();
  const book = await prisma.userBook.findFirst({
    where: { userId: session!.user.id, edition: { workId: params.workId } },
    select: { edition: { select: { work: { select: { title: true } } } } },
  });
  if (!book) notFound();
  const latest = await prisma.bookReview.findFirst({
    where: { userId: session!.user.id, workId: params.workId },
    orderBy: { version: "desc" },
  });
  const review = latest?.active ? latest : null;
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community/reviews">
        Your reviews
      </Link>
      <h1 className="font-display text-3xl">
        Review {book.edition.work.title}
      </h1>
      <p>
        Publishing requires a{" "}
        <Link className="underline" href="/settings/profile">
          public profile
        </Link>
        .
      </p>
      {latest?.isHidden && (
        <p role="status">
          This review has been hidden by a moderator. Saving edits will not
          republish it.
        </p>
      )}
      {latest?.isHidden && (
        <AppealReview
          workId={params.workId}
          moderationVersion={latest.moderationVersion}
        />
      )}
      <PublishingForm
        workId={params.workId}
        initial={{
          body: review?.body ?? "",
          rating: review?.rating ?? null,
          isPublic: review?.isPublic ?? false,
          version: latest?.version ?? 0,
        }}
      />
    </main>
  );
}
