import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { giftInclude, serializeGift } from "@/lib/gift-data";
import { nextOccasion, pounds } from "@/lib/gifts";
import { DismissReminder } from "@/components/gifts/DismissReminder";
export default async function GiftsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(searchParams.page) || 1)),
  );
  const stored = await prisma.giftContact.findMany({
    where: { userId: session.user.id },
    include: giftInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * 24,
    take: 25,
  });
  const contacts = stored.slice(0, 24).map(serializeGift);
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <Link href="/library" className="text-sm text-shelf-700">
        Back to Library
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">Gift lists</h1>
        <Link
          href="/library/gifts/new"
          className="rounded bg-shelf-700 text-white px-4 py-2"
        >
          Add someone
        </Link>
      </header>
      <p className="text-ink-500">
        Private ideas for the readers in your life.
      </p>
      {contacts.flatMap((contact) =>
        contact.occasions
          .map((o) => nextOccasion(o))
          .filter((o) => o && o.days <= 21 && o.dismissedFor !== o.occurrence)
          .map((o) => (
            <section
              key={`${contact.id}-${o!.id}`}
              aria-label={`Reminder for ${contact.name}`}
              className="bg-amber-100 rounded-md p-4 space-y-3"
            >
              <h2 className="font-medium break-words">
                {contact.name}: {o!.label}{" "}
                {o!.days === 0 ? "is today" : `is in ${o!.days} days`}.
              </h2>
              {contact.budgetPence !== null && (
                <>
                  <p className="text-sm">
                    Planned ideas within your {pounds(contact.budgetPence)}{" "}
                    budget, using your estimates:
                  </p>
                  <ul className="space-y-1">
                    {contact.items
                      .filter(
                        (i) =>
                          i.status === "planned" &&
                          i.pricePence !== null &&
                          i.pricePence <= contact.budgetPence!,
                      )
                      .slice(0, 3)
                      .map((i) => (
                        <li key={i.workId} className="text-sm">
                          <Link
                            href={`/library/gifts/${contact.id}`}
                            className="text-shelf-700 underline"
                          >
                            {i.work.title}
                          </Link>{" "}
                          &middot; {pounds(i.pricePence)}
                        </li>
                      ))}
                  </ul>
                </>
              )}
              <Link
                href={`/library/gifts/${contact.id}`}
                className="text-sm text-shelf-700 underline"
              >
                View gift ideas
              </Link>
              <DismissReminder
                contactId={contact.id}
                occasionId={o!.id}
                occurrence={o!.occurrence}
              />
            </section>
          )),
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {contacts.map((contact) => {
          const next = contact.occasions
            .map((o) => nextOccasion(o))
            .filter((o) => o !== null)
            .sort((a, b) => a.days - b.days)[0];
          return (
            <Link
              key={contact.id}
              href={`/library/gifts/${contact.id}`}
              className="bg-paper-100 rounded-md p-4 shadow-card hover:shadow-panel text-center space-y-2"
            >
              <div
                aria-hidden
                className="mx-auto rounded-full w-14 h-14 bg-shelf-100 text-shelf-700 flex items-center justify-center text-xl"
              >
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="font-display text-base break-words">
                {contact.name}
              </h2>
              <p
                className={`text-xs ${next && next.days <= 30 ? "text-amber-600" : "text-ink-500"}`}
              >
                {next
                  ? `${next.label}: ${next.occurrence}`
                  : "No upcoming occasion"}
              </p>
              <p className="text-xs text-ink-500">
                {contact.items.length} book ideas
              </p>
            </Link>
          );
        })}
      </div>
      {!contacts.length && (
        <p>No people on this page yet. Add someone to start their gift list.</p>
      )}
      <nav
        aria-label="Gift list pages"
        className="flex justify-between text-shelf-700"
      >
        {page > 1 && (
          <Link href={`/library/gifts?page=${page - 1}`}>Previous page</Link>
        )}
        {stored.length > 24 && (
          <Link href={`/library/gifts?page=${page + 1}`}>Next page</Link>
        )}
      </nav>
    </div>
  );
}
