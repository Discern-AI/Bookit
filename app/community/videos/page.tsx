import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicVideoDirectory() {
  const videos = await prisma.videoProject.findMany({ where: { isPublic: true, deletedAt: null, publicModerationStatus: "active", clip: { isNot: null } }, select: { id: true, title: true, publicDescription: true, publishedAt: true, books: { include: { work: { select: { title: true, authorName: true } } }, orderBy: { position: "asc" }, take: 12 } }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 50 });
  return <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6"><nav><Link className="text-shelf-700 underline" href="/browse">Browse</Link></nav><header><h1 className="font-display text-4xl">Video feed</h1><p className="text-ink-500 mt-2">Reader videos shared inside Folio. External provider connections are not used.</p></header>{videos.map((video) => <article key={video.id} className="rounded border border-ink-200 p-4"><h2 className="font-display text-xl"><Link className="text-shelf-700 underline" href={`/video/${video.id}`}>{video.title}</Link></h2>{video.publicDescription && <p className="mt-2 text-sm whitespace-pre-wrap">{video.publicDescription}</p>}<p className="mt-2 text-xs text-ink-500">{video.books.map((entry) => entry.work.title).join(" · ")}</p></article>)}{!videos.length && <p>No public videos yet.</p>}</main>;
}
