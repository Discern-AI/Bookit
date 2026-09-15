import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShareShelf } from "@/components/community/ShareShelf";
import { reviewPage } from "@/components/community/ReviewList";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  const userId = session!.user.id;
  const page = reviewPage(searchParams.page);
  const [me, shelves] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { profilePublic: true },
    }),
    prisma.customShelf.findMany({
      where: { userId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 21,
      skip: (page - 1) * 20,
      select: { id: true, name: true, isPublic: true, shareVersion: true },
    }),
  ]);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Shelf sharing</h1>
      <p>
        Publish selected custom shelves. Built-in reading-status shelves stay
        private. Create and organise shelves in{" "}
        <Link className="underline" href="/library">
          Library
        </Link>
        .
      </p>
      {!me.profilePublic && (
        <p>
          Your profile is private.{" "}
          <Link className="underline" href="/settings/profile">
            Manage public profile
          </Link>{" "}
          before publishing shelves.
        </p>
      )}
      {!shelves.length && <p>No custom shelves on this page.</p>}
      {shelves.slice(0, 20).map((shelf) => (
        <article
          key={shelf.id}
          className="border border-ink-200 rounded-lg p-4 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">{shelf.name}</h2>
          <p>
            {shelf.isPublic
              ? me.profilePublic
                ? "Shared publicly"
                : "Shared - profile private"
              : "Private"}
          </p>
          <div className="flex flex-wrap gap-4 items-center">
            <ShareShelf
              key={`${shelf.id}-${shelf.shareVersion}`}
              id={shelf.id}
              name={shelf.name}
              isPublic={shelf.isPublic}
              version={shelf.shareVersion}
            />
            {shelf.isPublic && me.profilePublic && (
              <Link className="underline" href={`/shelf/${shelf.id}`}>
                View public shelf
              </Link>
            )}
          </div>
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Shelf management pages">
        {page > 1 && (
          <Link href={`/settings/shelves?page=${page - 1}`}>Previous</Link>
        )}
        {shelves.length > 20 && (
          <Link href={`/settings/shelves?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
