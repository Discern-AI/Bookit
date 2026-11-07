import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicKitsPage() {
  const kits = await prisma.readingKit.findMany({
    where: {
      isPublic: true,
      publicModerationStatus: "active",
      deletedAt: null,
    },
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
    take: 50,
  });
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
      <div className="grid md:grid-cols-2 gap-4">
        {kits.map((kit) => (
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
      {!kits.length && <p>No public Reading Kits yet.</p>}
    </main>
  );
}
