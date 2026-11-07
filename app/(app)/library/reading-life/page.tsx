import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ReadingKitBuilder,
  type ReadingKitData,
} from "@/components/context/ReadingKitBuilder";
import { ReadingAfternoonPlanner } from "@/components/context/ReadingAfternoonPlanner";

export default async function ReadingLifePage() {
  const session = await auth();
  if (!session?.user) return null;
  const [kits, savedWorks, afternoons] = await Promise.all([
    prisma.readingKit.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: {
        entries: {
          include: {
            work: { select: { id: true, title: true, authorName: true } },
          },
          orderBy: { position: "asc" },
        },
        items: { orderBy: { position: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 21,
    }),
    prisma.work.findMany({
      where: {
        editions: {
          some: { userBooks: { some: { userId: session.user.id } } },
        },
      },
      select: { id: true, title: true, authorName: true },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 20,
    }),
    prisma.readingAfternoon.findMany({
      where: { userId: session.user.id, deletedAt: null },
      include: {
        work: { select: { id: true, title: true, authorName: true } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      take: 21,
    }),
  ]);
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <nav className="flex gap-4">
        <Link className="text-shelf-700 underline" href="/library">
          Library
        </Link>
        <Link className="text-shelf-700 underline" href="/library/marketplace">
          Marketplace
        </Link>
      </nav>
      <header>
        <h1 className="font-display text-4xl">Reading Life</h1>
        <p className="text-ink-500 mt-2">
          Plan reading rituals around the books, objects and places you already
          have.
        </p>
      </header>
      <ReadingKitBuilder
        works={savedWorks}
        initial={kits.slice(0, 20) as ReadingKitData[]}
        initialNextPage={kits.length > 20 ? 1 : null}
      />
      <ReadingAfternoonPlanner
        works={savedWorks}
        kits={kits
          .slice(0, 20)
          .map((kit) => ({ id: kit.id, title: kit.title }))}
        initial={afternoons.slice(0, 20).map((item) => ({
          ...item,
          date: item.date.toISOString(),
          work: item.work,
        }))}
        initialNextPage={afternoons.length > 20 ? 1 : null}
      />
    </main>
  );
}
