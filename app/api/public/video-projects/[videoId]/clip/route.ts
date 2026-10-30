import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { videoRange } from "@/lib/video-clips";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function publicClip(videoId: string) {
  if (!z.string().uuid().safeParse(videoId).success) return null;
  return prisma.videoProject.findFirst({ where: { id: videoId, isPublic: true, deletedAt: null, publicModerationStatus: "active", clip: { isNot: null } }, select: { clip: { select: { id: true, mimeType: true, data: true, captions: true } } } });
}

export async function GET(request: Request, { params }: { params: { videoId: string } }) {
  const project = await publicClip(params.videoId);
  if (!project?.clip) return new Response("Video not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const clip = project.clip;
  const url = new URL(request.url);
  if (url.searchParams.get("id") !== clip.id) return new Response("Video not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (url.searchParams.has("captions")) {
    if (!clip.captions) return new Response("Captions not found", { status: 404 });
    return new Response(clip.captions, { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  const size = clip.data.length;
  const range = videoRange(request.headers.get("range"), size);
  if (range === false) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "public, max-age=300" } });
  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  return new Response(new Uint8Array(clip.data.subarray(start, end + 1)), { status: range ? 206 : 200, headers: { "Content-Type": clip.mimeType, "Content-Disposition": "inline", "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) } });
}
