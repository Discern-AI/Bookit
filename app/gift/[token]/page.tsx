import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GiftClaim } from "@/components/gifts/GiftClaim";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared gift ideas | Folio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SharedGiftPage({
  params,
}: {
  params: { token: string };
}) {
  if (!/^[a-f0-9]{64}$/.test(params.token)) notFound();
  const [contact, session] = await Promise.all([
    prisma.giftContact.findUnique({
      where: { shareToken: params.token },
      select: {
        name: true,
        userId: true,
        giftItems: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            claimedById: true,
            claimVersion: true,
            work: { select: { id: true, title: true, authorName: true } },
          },
        },
      },
    }),
    auth(),
  ]);
  if (!contact) notFound();
  const loginUrl = `/login?next=${encodeURIComponent(`/gift/${params.token}`)}`;
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <nav className="flex justify-between text-shelf-700">
        <Link href={session?.user ? "/library/gifts" : loginUrl}>Folio</Link>
        {!session?.user && <Link href={loginUrl}>Sign in</Link>}
      </nav>
      <header className="space-y-3">
        <h1 className="font-display text-3xl break-words">
          Gift ideas for {contact.name}
        </h1>
        <p className="text-ink-500">
          Claim a book to let other gift-givers know you are arranging it. A
          claim does not purchase or send a gift.
        </p>
      </header>
      {!contact.giftItems.length && <p>No gift ideas have been added yet.</p>}
      {contact.giftItems.map((item) => (
        <article
          key={item.id}
          className="bg-paper-100 rounded-md p-5 space-y-3"
        >
          <h2 className="font-display text-2xl break-words">
            {item.work.title}
          </h2>
          <p className="text-sm text-ink-500">{item.work.authorName}</p>
          <Link
            href={`/book/${item.work.id}`}
            className="text-sm text-shelf-700 underline"
            referrerPolicy="no-referrer"
          >
            Compare editions and shop searches
          </Link>
          {session?.user ? (
            <GiftClaim
              key={`${item.id}-${item.claimVersion}-${item.status}`}
              endpoint={`/api/gift-shares/${params.token}/claims/${item.id}`}
              version={item.claimVersion}
              claimed={!!item.claimedById}
              mine={item.claimedById === session.user.id}
              canRelease={
                !!item.claimedById &&
                (item.claimedById === session.user.id ||
                  contact.userId === session.user.id)
              }
              available={item.status === "planned"}
            />
          ) : (
            <>
              <p className="text-sm text-ink-500">
                {item.status !== "planned"
                  ? "Already arranged"
                  : item.claimedById
                    ? "Claimed"
                    : "Available to claim"}
              </p>
              {item.status === "planned" && !item.claimedById && (
                <Link
                  href={loginUrl}
                  className="text-sm text-shelf-700 underline"
                >
                  Sign in to claim this gift
                </Link>
              )}
            </>
          )}
        </article>
      ))}
    </main>
  );
}
