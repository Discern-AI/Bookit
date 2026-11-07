import Link from "next/link";
import { auth } from "@/auth";
import {
  MarketplaceFoundation,
  type MarketplaceItem,
} from "@/components/context/MarketplaceFoundation";
import { prisma } from "@/lib/prisma";

export default async function MarketplacePage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [works, published, mine] = await Promise.all([
    prisma.work.findMany({
      where: {
        editions: {
          some: { userBooks: { some: { userId: session.user.id } } },
        },
      },
      select: { id: true, title: true, authorName: true },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 100,
    }),
    prisma.marketplaceListing.findMany({
      where: { isPublished: true, deletedAt: null },
      include: {
        work: { select: { id: true, title: true, authorName: true } },
        saves: { where: { userId: session.user.id }, select: { userId: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 50,
    }),
    prisma.marketplaceListing.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: {
        work: { select: { id: true, title: true, authorName: true } },
        saves: { where: { userId: session.user.id }, select: { userId: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 50,
    }),
  ]);
  const items = new Map(
    [...published, ...mine].map(({ saves, userId, ...item }) => [
      item.id,
      {
        ...item,
        isSaved: saves.length > 0,
        isOwner: userId === session.user.id,
      },
    ]),
  );
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <nav className="flex gap-4">
        <Link className="text-shelf-700 underline" href="/library">
          Library
        </Link>
        <Link className="text-shelf-700 underline" href="/library/reading-life">
          Reading Life
        </Link>
      </nav>
      <header>
        <h1 className="font-display text-4xl">Marketplace</h1>
        <p className="text-ink-500 mt-2">
          Books and reading objects, always paired with a way to use what you
          already have.
        </p>
      </header>
      <MarketplaceFoundation
        works={works}
        initial={[...items.values()] as MarketplaceItem[]}
      />
    </main>
  );
}
