import Link from "next/link";
import { prisma } from "@/lib/prisma";
export async function ProfileCollections({
  userId,
  username,
  tab,
  page,
}: {
  userId: string;
  username: string;
  tab: "shelves" | "paths";
  page: number;
}) {
  const items =
    tab === "shelves"
      ? await prisma.customShelf.findMany({
          where: { userId, isPublic: true, user: { profilePublic: true } },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 21,
          skip: (page - 1) * 20,
        })
      : await prisma.readingPath.findMany({
          where: { userId, isPublic: true, user: { profilePublic: true } },
          select: { id: true, title: true, description: true },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: 21,
          skip: (page - 1) * 20,
        });
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">
        {tab === "shelves" ? "Public shelves" : "Public reading paths"}
      </h2>
      {!items.length && <p>Nothing published on this page yet.</p>}
      {items.slice(0, 20).map((item) => (
        <article
          key={item.id}
          className="border border-ink-200 rounded-lg p-4 space-y-2"
        >
          <h3 className="font-display text-xl break-words">
            <Link
              className="underline"
              href={`/${tab === "shelves" ? "shelf" : "path"}/${item.id}`}
            >
              {"name" in item ? item.name : item.title}
            </Link>
          </h3>
          {"description" in item && (
            <p className="text-ink-500 break-words">{item.description}</p>
          )}
        </article>
      ))}
      <nav className="flex gap-4" aria-label="Profile collection pages">
        {page > 1 && (
          <Link href={`/profile/${username}?tab=${tab}&page=${page - 1}`}>
            Previous
          </Link>
        )}
        {items.length > 20 && (
          <Link href={`/profile/${username}?tab=${tab}&page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </section>
  );
}
