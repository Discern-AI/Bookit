import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ModerateReadingKitReport } from "@/components/context/ReadingKitModeration";
import { prisma } from "@/lib/prisma";
export default async function Page(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  const moderator = await prisma.user.findUnique({
    where: { id: session?.user?.id },
    select: { isModerator: true },
  });
  if (!moderator?.isModerator) notFound();
  const resolved = searchParams.status === "resolved";
  const reports = await prisma.readingKitReport.findMany({
    where: { status: resolved ? { not: "pending" } : "pending" },
    include: {
      kit: { select: { version: true, publicModerationStatus: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Reading Kit moderation</h1>
      <nav className="flex gap-4">
        <Link className="underline" href="/community/moderation">
          Reports
        </Link>
        <Link className="underline" href="/community/moderation/reading-kits">
          Pending kits
        </Link>
        <Link
          className="underline"
          href="/community/moderation/reading-kits?status=resolved"
        >
          Resolved kits
        </Link>
      </nav>
      <p>
        Snapshots contain public kit fields only. Private Plan notes are
        excluded.
      </p>
      {reports.map((report) => (
        <article key={report.id} className="rounded border p-4 space-y-3">
          <h2 className="font-display text-xl">{report.title}</h2>
          <p>
            {report.reason}: {report.details}
          </p>
          <p>{report.publicDescription}</p>
          {report.status === "pending" ? (
            <ModerateReadingKitReport
              reportId={report.id}
              version={report.kit.version}
            />
          ) : (
            <>
              <p>
                {report.status}: {report.note}
              </p>
              {report.status === "hidden" &&
                report.kit.publicModerationStatus === "hidden" && (
                  <ModerateReadingKitReport
                    reportId={report.id}
                    version={report.kit.version}
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
