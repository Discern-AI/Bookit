import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ReportReadingKit } from "@/components/context/ReadingKitModeration";
import { prisma } from "@/lib/prisma";

export default async function PublicKitPage({
  params,
}: {
  params: { kitId: string };
}) {
  const session = await auth();
  const kit = await prisma.readingKit.findFirst({
    where: {
      id: params.kitId,
      isPublic: true,
      publicModerationStatus: "active",
      deletedAt: null,
    },
    include: {
      entries: {
        include: {
          work: { select: { id: true, title: true, authorName: true } },
        },
        orderBy: { position: "asc" },
      },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!kit) notFound();
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <nav>
        <Link className="underline" href="/community/kits">
          Community Reading Kits
        </Link>
      </nav>
      <header>
        <h1 className="font-display text-4xl">{kit.title}</h1>
        <p>{kit.publicDescription}</p>
        <p className="text-sm uppercase">{kit.budgetTier.replace("_", " ")}</p>
      </header>
      {kit.creatorEssay && (
        <section>
          <h2 className="font-display text-2xl">Introduction</h2>
          <p className="whitespace-pre-wrap">{kit.creatorEssay}</p>
        </section>
      )}
      {kit.makeDo && (
        <section>
          <h2 className="font-display text-2xl">Use what you have</h2>
          <p className="whitespace-pre-wrap">{kit.makeDo}</p>
        </section>
      )}
      {kit.sensoryProfile && (
        <section>
          <h2 className="font-display text-2xl">Atmosphere</h2>
          <p className="whitespace-pre-wrap">{kit.sensoryProfile}</p>
        </section>
      )}
      <section>
        <h2 className="font-display text-2xl">Books</h2>
        {kit.entries.map((entry) => (
          <p key={entry.workId}>
            <Link className="underline" href={`/book/${entry.work.id}`}>
              {entry.work.title} — {entry.work.authorName}
            </Link>
          </p>
        ))}
      </section>
      {kit.suggestedOrder && (
        <section>
          <h2 className="font-display text-2xl">Suggested order</h2>
          <p className="whitespace-pre-wrap">{kit.suggestedOrder}</p>
        </section>
      )}
      {kit.playlistUrl && (
        <a
          className="underline"
          href={kit.playlistUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open playlist
        </a>
      )}
      {!!kit.items.length && (
        <section>
          <h2 className="font-display text-2xl">Objects and resources</h2>
          <ol className="space-y-2 list-decimal pl-5">
            {kit.items.map((item) => (
              <li key={item.position}>
                <strong>{item.title}</strong>
                {item.details ? ` — ${item.details}` : ""}
                {item.externalUrl && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="underline"
                      href={item.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      External link
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {session?.user?.id && session.user.id !== kit.userId && (
        <ReportReadingKit kitId={kit.id} />
      )}
      <p className="text-sm text-ink-500">
        Private planning notes are not included. External links, products and
        availability are not verified by Folio.
      </p>
    </main>
  );
}
