import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ModerateMarketplaceReport } from "@/components/context/MarketplaceModeration";
import { prisma } from "@/lib/prisma";

export default async function MarketplaceModerationPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await auth();
  const moderator = await prisma.user.findUnique({
    where: { id: session?.user?.id },
    select: { isModerator: true },
  });
  if (!moderator?.isModerator) notFound();
  const resolved = searchParams.status === "resolved";
  const reports = await prisma.marketplaceReport.findMany({
    where: { status: resolved ? { not: "pending" } : "pending" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
    include: {
      listing: {
        select: {
          id: true,
          version: true,
          isPublished: true,
          deletedAt: true,
          moderationStatus: true,
        },
      },
    },
  });
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Marketplace moderation</h1>
      <nav className="flex flex-wrap gap-4">
        <Link className="underline" href="/community/moderation">
          Review reports
        </Link>
        <Link className="underline" href="/community/moderation/videos">
          Video reports
        </Link>
        <Link className="underline" href="/community/moderation/marketplace">
          Pending marketplace
        </Link>
        <Link
          className="underline"
          href="/community/moderation/marketplace?status=resolved"
        >
          Resolved marketplace
        </Link>
      </nav>
      <p>
        Reports contain a snapshot of public listing fields only. Saves,
        journals, library history and private drafts are excluded.
      </p>
      {!reports.length && <p>No marketplace reports on this page.</p>}
      {reports.map((report) => (
        <article
          key={report.id}
          className="rounded border border-ink-200 p-4 space-y-3"
        >
          <h2 className="font-display text-xl">{report.title}</h2>
          <p>Reason: {report.reason}</p>
          <p className="whitespace-pre-wrap">{report.details}</p>
          <p className="whitespace-pre-wrap">{report.description}</p>
          <p>
            <strong>Use what you have:</strong> {report.makeDoAlternative}
          </p>
          {report.status === "pending" ? (
            <ModerateMarketplaceReport
              reportId={report.id}
              version={report.listing.version}
            />
          ) : (
            <>
              <p>
                {report.status}: {report.note}
              </p>
              {report.status === "hidden" &&
                report.listing.moderationStatus === "hidden" && (
                  <ModerateMarketplaceReport
                    reportId={report.id}
                    version={report.listing.version}
                    restore
                  />
                )}
            </>
          )}
        </article>
      ))}
    </main>
  );
}
