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
  const review = await prisma.bookReview.findUnique({
    where: {
      userId_workId: { userId: session!.user.id, workId: params.workId },
    },
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
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
      <PublishingForm
        workId={params.workId}
        initial={{
          body: review?.body ?? "",
          rating: review?.rating ?? null,
          isPublic: review?.isPublic ?? false,
          version: review?.version ?? 0,
        }}
      />
    </main>
  );
}
