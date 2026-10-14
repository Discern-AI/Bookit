import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_VIDEO_BYTES, videoMime, videoRange } from "@/lib/video-clips";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (error: string, status: number) =>
  Response.json({ error }, { status, headers });
type Context = { params: { projectId: string } };
async function owner(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (!z.string().uuid().safeParse(projectId).success) return null;
  return prisma.videoProject.findFirst({
    where: { id: projectId, userId: session.user.id, deletedAt: null },
    select: { id: true },
  });
}
export async function GET(request: Request, { params }: Context) {
  if (!(await owner(params.projectId))) return reply("Video not found.", 404);
  const meta = await prisma.videoClip.findUnique({
    where: { projectId: params.projectId },
    select: { id: true, mimeType: true, createdAt: true },
  });
  if (new URL(request.url).searchParams.has("metadata"))
    return Response.json({ clip: meta }, { headers });
  if (!meta || new URL(request.url).searchParams.get("id") !== meta.id)
    return reply("Video not found.", 404);
  const clip = await prisma.videoClip.findFirst({
    where: { id: meta.id, project: { deletedAt: null } },
    select: { data: true },
  });
  if (!clip) return reply("Video not found.", 404);
  const size = clip.data.length,
    range = videoRange(request.headers.get("range"), size);
  if (range === false)
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${size}` },
    });
  const start = range ? range.start : 0,
    end = range ? range.end : size - 1;
  return new Response(new Uint8Array(clip.data.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Type": meta.mimeType,
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
export async function POST(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply("Invalid request.", 403);
  if (!(await owner(params.projectId)))
    return reply("Video plan not found.", 404);
  let data: Buffer;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply("Choose a video.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_VIDEO_BYTES) {
        await reader.cancel();
        return reply("Choose a video up to 25 MB.", 413);
      }
      chunks.push(part.value);
    }
    data = Buffer.concat(chunks);
  } catch {
    return reply("Upload interrupted. Try again.", 400);
  }
  const mimeType = videoMime(data);
  if (!mimeType) return reply("Choose an MP4 or WebM video.", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"video-project:" + params.projectId}))`;
      if (
        !(await tx.videoProject.findFirst({
          where: { id: params.projectId, deletedAt: null },
          select: { id: true },
        }))
      )
        return reply("Video plan was deleted.", 409);
      if (
        await tx.videoClip.findUnique({
          where: { projectId: params.projectId },
          select: { id: true },
        })
      )
        return reply(
          "This plan already has a clip. Reload to review it before removing it.",
          409,
        );
      const clip = await tx.videoClip.create({
        data: {
          projectId: params.projectId,
          mimeType,
          data: new Uint8Array(data),
        },
        select: { id: true, mimeType: true, createdAt: true },
      });
      return Response.json({ clip }, { status: 201, headers });
    });
  } catch {
    return reply(
      "Could not upload. Reload to check whether it was saved before retrying.",
      503,
    );
  }
}
export async function DELETE(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply("Invalid request.", 403);
  if (!(await owner(params.projectId))) return reply("Video not found.", 404);
  const id = new URL(request.url).searchParams.get("id");
  if (!z.string().uuid().safeParse(id).success)
    return reply("Invalid clip.", 400);
  await prisma.videoClip.deleteMany({
    where: { id: id!, projectId: params.projectId },
  });
  return Response.json({ ok: true }, { headers });
}
