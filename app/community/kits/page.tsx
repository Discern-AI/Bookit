import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  encodePublicKitCursor,
  parsePublicKitFilters,
  publicKitQuery,
} from "@/lib/public-reading-kits";

export const dynamic = "force-dynamic";

export default async function PublicKitsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parsePublicKitFilters(searchParams);
  const where: Prisma.ReadingKitWhereInput = {
    isPublic: true,
    publicModerationStatus: "active",
    deletedAt: null,
    publishedAt: { not: null },
    ...(filters.budget === "all" ? {} : { budgetTier: filters.budget }),
    ...(filters.content === "books" ? { entries: { some: {} } } : {}),
    ...(filters.content === "items" ? { items: { some: {} } } : {}),
    AND: [
      ...(filters.q
        ? [
            {
              OR: [
                { title: { contains: filters.q, mode: "insensitive" } },
                {
                  publicDescription: {
                    contains: filters.q,
                    mode: "insensitive",
                  },
                },
                { creatorEssay: { contains: filters.q, mode: "insensitive" } },
                { makeDo: { contains: filters.q, mode: "insensitive" } },
                {
                  sensoryProfile: { contains: filters.q, mode: "insensitive" },
                },
                {
                  suggestedOrder: { contains: filters.q, mode: "insensitive" },
                },
                {
                  entries: {
                    some: {
                      work: {
                        OR: [
                          {
                            title: { contains: filters.q, mode: "insensitive" },
                          },
                          {
                            authorName: {
                              contains: filters.q,
                              mode: "insensitive",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                {
                  items: {
                    some: {
                      OR: [
                        { title: { contains: filters.q, mode: "insensitive" } },
                        {
                          details: { contains: filters.q, mode: "insensitive" },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(filters.cursor
        ? [
            {
              OR: [
                { publishedAt: { lt: filters.cursor.publishedAt } },
                {
                  publishedAt: filters.cursor.publishedAt,
                  id: { gt: filters.cursor.id },
                },
              ],
            },
          ]
        : []),
    ] as Prisma.ReadingKitWhereInput[],
  };
  const kits = await prisma.readingKit.findMany({
    where,
    select: {
      id: true,
      title: true,
      publicDescription: true,
      budgetTier: true,
      publishedAt: true,
      entries: {
        select: { work: { select: { title: true, authorName: true } } },
        orderBy: { position: "asc" },
        take: 3,
      },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: 21,
  });
  const visibleKits = kits.slice(0, 20);
  const lastKit = visibleKits.at(-1);
  const nextCursor =
    kits.length > 20 && lastKit?.publishedAt
      ? encodePublicKitCursor(lastKit.publishedAt, lastKit.id)
      : null;
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <nav>
        <Link className="underline" href="/community">
          Community
        </Link>
      </nav>
      <header>
        <h1 className="font-display text-4xl">Community Reading Kits</h1>
        <p>
          Reader-created rituals with a make-do path. Product links and
          availability are not verified; kits are not sold by Folio.
        </p>
      </header>
      <form className="grid gap-3 rounded border border-ink-200 p-4 md:grid-cols-4">
        <label className="md:col-span-2">
          Search public kits
          <input
            className="mt-1 w-full rounded border p-2"
            defaultValue={filters.q}
            name="q"
            placeholder="Kit, book, author or package item"
          />
        </label>
        <label>
          Budget approach
          <select
            className="mt-1 w-full rounded border p-2"
            defaultValue={filters.budget}
            name="budget"
          >
            <option value="all">All budgets</option>
            <option value="make_do">Make do</option>
            <option value="comfortable">Comfortable</option>
            <option value="collector">Collector</option>
            <option value="dream">Dream library</option>
          </select>
        </label>
        <label>
          Includes
          <select
            className="mt-1 w-full rounded border p-2"
            defaultValue={filters.content}
            name="content"
          >
            <option value="all">Anything</option>
            <option value="books">Books</option>
            <option value="items">Objects or resources</option>
          </select>
        </label>
        <div className="flex gap-3 md:col-span-4">
          <button className="rounded bg-ink-900 px-4 py-2 text-white">
            Search kits
          </button>
          <Link className="px-2 py-2 underline" href="/community/kits">
            Clear filters
          </Link>
        </div>
      </form>
      <div className="grid md:grid-cols-2 gap-4">
        {visibleKits.map((kit) => (
          <article
            key={kit.id}
            className="rounded border border-ink-200 p-4 space-y-2"
          >
            <h2 className="font-display text-2xl">
              <Link className="underline" href={`/kit/${kit.id}`}>
                {kit.title}
              </Link>
            </h2>
            <p>{kit.publicDescription}</p>
            <p className="text-sm">{kit.budgetTier.replace("_", " ")}</p>
            {kit.entries.map((entry) => (
              <p key={entry.work.title} className="text-sm">
                {entry.work.title} — {entry.work.authorName}
              </p>
            ))}
          </article>
        ))}
      </div>
      {!visibleKits.length && (
        <p>No public Reading Kits match these filters.</p>
      )}
      {nextCursor && (
        <Link
          className="inline-block rounded border border-ink-900 px-4 py-2"
          href={publicKitQuery(filters, nextCursor)}
        >
          Next page
        </Link>
      )}
    </main>
  );
}
