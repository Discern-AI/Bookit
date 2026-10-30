import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ModeratePublicVideoReport } from "@/components/articles/VideoReportActions";

export default async function Page({ searchParams }: { searchParams: { status?: string } }) {
  const session = await auth();
  const moderator = await prisma.user.findUnique({ where: { id: session?.user?.id }, select: { isModerator: true } });
  if (!moderator?.isModerator) notFound();
  const resolved = searchParams.status === "resolved";
  const reports = await prisma.videoProjectReport.findMany({ where: { status: resolved ? { not: "pending" } : "pending" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50, include: { project: { select: { id: true, version: true, isPublic: true, deletedAt: true, publicModerationStatus: true } } } });
  return <main className="max-w-3xl mx-auto p-6 space-y-6"><h1 className="font-display text-3xl">Video moderation</h1><nav className="flex flex-wrap gap-4"><Link className="underline" href="/community/moderation">Review reports</Link><Link className="underline" href="/community/moderation/articles">Article reports</Link><Link className="underline" href="/community/moderation/videos">Pending videos</Link><Link className="underline" href="/community/moderation/videos?status=resolved">Resolved videos</Link></nav><p>Reports contain only public title/description and linked book IDs, never private scripts or notes.</p>{!reports.length && <p>No video reports on this page.</p>}{reports.map((report) => <article key={report.id} className="border border-ink-200 rounded p-4 space-y-3"><h2 className="font-display text-xl break-words">{report.title}</h2><p>Reason: {report.reason}</p><p className="whitespace-pre-wrap break-words">{report.details}</p><p className="whitespace-pre-wrap break-words">{report.publicDescription}</p>{report.status === "pending" ? <ModeratePublicVideoReport reportId={report.id} version={report.project.version} /> : <><p>{report.status}: {report.note}</p>{report.status === "hidden" && report.project.publicModerationStatus === "hidden" && <ModeratePublicVideoReport reportId={report.id} version={report.project.version} restore />}</>}</article>)}</main>;
}
