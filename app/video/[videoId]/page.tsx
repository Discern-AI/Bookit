import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ReportPublicVideo } from "@/components/articles/VideoReportActions";

export const dynamic = "force-dynamic";

export default async function PublicVideoPage({ params }: { params: { videoId: string } }) {
  if (!z.string().uuid().safeParse(params.videoId).success) notFound();
  const video = await prisma.videoProject.findFirst({ where: { id: params.videoId, isPublic: true, deletedAt: null, publicModerationStatus: "active", clip: { isNot: null } }, include: { clip: { select: { id: true, mimeType: true } }, books: { include: { work: { select: { id: true, title: true, authorName: true } } }, orderBy: { position: "asc" }, take: 12 }, user: { select: { publicName: true, username: true } } } });
  if (!video) notFound();
  return <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-5"><nav><Link className="text-shelf-700 underline" href="/community/videos">Video feed</Link></nav><article><h1 className="font-display text-4xl break-words">{video.title}</h1><p className="text-sm text-ink-500 mt-1">{video.user.publicName || video.user.username || "Folio reader"}</p><video className="mt-5 w-full rounded border border-ink-200" controls preload="metadata" src={`/api/public/video-projects/${video.id}/clip?id=${video.clip?.id}`}><track kind="captions" src={`/api/public/video-projects/${video.id}/clip?id=${video.clip?.id}&captions=1`} srcLang="en" /></video><p className="mt-4 whitespace-pre-wrap">{video.publicDescription}</p><section className="mt-5"><h2 className="font-display text-xl">Linked books</h2><ul className="mt-2 space-y-1">{video.books.map((entry) => <li key={entry.workId}><Link className="text-shelf-700 underline" href={`/book/${entry.workId}`}>{entry.work.title} — {entry.work.authorName}</Link></li>)}</ul></section><ReportPublicVideo videoId={video.id} /></article></main>;
}
