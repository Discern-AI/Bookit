import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { giftInclude, serializeGift } from "@/lib/gift-data";
import { GIFT_PRIORITY, nextOccasion, pounds } from "@/lib/gifts";
import { GetBook } from "@/components/books/GetBook";
export default async function GiftPage({
  params,
}: {
  params: { contactId: string };
}) {
  const session = await auth();
  if (!session?.user) return null;
  const stored = await prisma.giftContact.findFirst({
    where: { id: params.contactId, userId: session.user.id },
    include: giftInclude,
  });
  if (!stored) notFound();
  const contact = serializeGift(stored);
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <Link href="/library/gifts" className="text-shelf-700">
        All gift lists
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl break-words">
          Gift ideas for {contact.name}
        </h1>
        <Link
          href={`/library/gifts/${contact.id}/edit`}
          className="bg-shelf-700 text-white rounded px-4 py-2"
        >
          Edit gift list
        </Link>
      </header>
      <p className="text-sm text-ink-500">
        Private to you. Changing a gift status does not buy or send anything.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-library gap-8">
        <aside className="space-y-5">
          <section>
            <h2 className="font-display text-xl">Reading preferences</h2>
            <p className="text-sm whitespace-pre-wrap break-words">
              {contact.tasteNotes || "No preferences recorded yet."}
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl">Budget per gift</h2>
            <p>{pounds(contact.budgetPence)}</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display text-xl">Occasions</h2>
            {!contact.occasions.length && (
              <p className="text-sm text-ink-500">No occasions recorded.</p>
            )}
            {contact.occasions.map((o) => {
              const next = nextOccasion(o);
              return (
                <p key={o.id} className="text-sm break-words">
                  {o.label} &middot; {next?.occurrence ?? o.date}
                  {!next ? " (past)" : ""}
                  {o.annual ? " (annual)" : ""}
                </p>
              );
            })}
          </section>
        </aside>
        <section className="space-y-4" aria-label="Gift book ideas">
          {!contact.items.length && (
            <p>Add book ideas by editing this gift list.</p>
          )}
          {contact.items.map((item) => (
            <article
              key={item.workId}
              className="bg-paper-100 rounded-md p-5 space-y-3"
            >
              <h2 className="font-display text-2xl break-words">
                {item.work.title}
              </h2>
              <p className="text-sm text-ink-500">{item.work.authorName}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-shelf-100 text-shelf-700 rounded px-2 py-1 capitalize">
                  {item.status}
                </span>
                <span className="bg-paper-200 rounded px-2 py-1">
                  {GIFT_PRIORITY[item.priority]}
                </span>
              </div>
              <p className="text-sm">
                Your estimate: {pounds(item.pricePence)}
                {contact.budgetPence !== null &&
                item.pricePence !== null &&
                item.pricePence > contact.budgetPence ? (
                  <span className="text-amber-600"> &middot; Over budget</span>
                ) : null}
              </p>
              {item.note && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {item.note}
                </p>
              )}
              <Link
                href={`/book/${item.workId}`}
                className="inline-block text-sm text-shelf-700 underline"
              >
                Compare editions
              </Link>
              <GetBook title={item.work.title} author={item.work.authorName} />
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
