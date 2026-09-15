import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { reviewPage } from "@/components/community/ReviewList";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Shared shelf | Folio",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: { shelfId: string };
  searchParams: { page?: string };
}) {
  const shelf = await prisma.customShelf.findFirst({
    where: {
      id: params.shelfId,
      isPublic: true,
      user: { profilePublic: true },
    },
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { username: true, publicName: true } },
    },
  });
  if (!shelf) notFound();
  const page = reviewPage(searchParams.page);
  const books = await prisma.userBook.findMany({
    where: { userId: shelf.userId, customShelves: { some: { id: shelf.id } } },
    orderBy: [{ edition: { work: { title: "asc" } } }, { editionId: "asc" }],
    take: 21,
    skip: (page - 1) * 20,
    select: {
      edition: {
        select: {
          id: true,
          editionTitle: true,
          publisher: true,
          year: true,
          format: true,
          work: { select: { id: true, title: true, authorName: true } },
        },
      },
    },
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link
        className="underline"
        href={`/profile/${shelf.user.username}?tab=shelves`}
      >
        {shelf.user.publicName}
      </Link>
      <h1 className="font-display text-3xl break-words">{shelf.name}</h1>
      <p className="text-ink-500">A shelf shared by {shelf.user.publicName}.</p>
      {!books.length && <p>No books on this page.</p>}
      {books.slice(0, 20).map(({ edition }) => (
        <article
          key={edition.id}
          className="border border-ink-200 rounded-lg p-4 space-y-2"
        >
          <h2 className="font-display text-2xl break-words">
            <Link className="underline" href={`/book/${edition.work.id}`}>
              {edition.editionTitle || edition.work.title}
            </Link>
          </h2>
          <p>{edition.work.authorName}</p>
          <p className="text-sm text-ink-500">
            {[edition.format, edition.publisher, edition.year]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Shared shelf pages">
        {page > 1 && (
          <Link href={`/shelf/${shelf.id}?page=${page - 1}`}>Previous</Link>
        )}
        {books.length > 20 && (
          <Link href={`/shelf/${shelf.id}?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
