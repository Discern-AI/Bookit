import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storedZip } from "@/lib/stored-zip";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  { params }: { params: { projectId: string } },
) {
  const session = await auth();
  const id = new URL(request.url).searchParams.get("clip");
  const missing = () =>
    Response.json(
      {
        error:
          "Saved video not found. Reload the plan to check its current clip.",
      },
      { status: 404, headers },
    );
  if (
    !session?.user?.id ||
    !z.string().uuid().safeParse(params.projectId).success ||
    !z.string().uuid().safeParse(id).success
  )
    return missing();
  try {
    // One read with explicit fields: scripts, notes, account data and posted URLs
    // never enter the archive. The exact clip ID prevents stale-page substitution.
    const clip = await prisma.videoClip.findFirst({
      where: {
        id: id!,
        projectId: params.projectId,
        project: { userId: session.user.id, deletedAt: null },
      },
      select: {
        data: true,
        mimeType: true,
        captions: true,
        project: {
          select: {
            books: {
              orderBy: { position: "asc" },
              select: { work: { select: { title: true, authorName: true } } },
            },
          },
        },
      },
    });
    if (!clip) return missing();
    const extension =
      clip.mimeType === "video/mp4"
        ? "mp4"
        : clip.mimeType === "video/webm"
          ? "webm"
          : null;
    if (!extension) return missing();
    const credits =
      "Books featured\n\n" +
      clip.project.books
        .map(
          ({ work }, index) =>
            `${index + 1}. ${work.title} - ${work.authorName}`,
        )
        .join("\n") +
      "\n";
    const entries = [
      { name: `video.${extension}`, data: clip.data },
      { name: "book-credits.txt", data: Buffer.from(credits, "utf8") },
      {
        name: "read-me.txt",
        data: Buffer.from(
          "Folio posting files\n\nThis download contains your saved video, saved captions when present, and the current titles/authors of its linked books in order.\n\nReview these files before sharing them. Upload the video and captions through your chosen platform; downloading this archive does not publish anything or change the plan status. Platform format requirements may differ.\n\nScripts, production notes and unsaved edits are not included. After posting, you can record the resulting URL in your Folio video plan.\n",
          "utf8",
        ),
      },
    ];
    if (clip.captions)
      entries.push({
        name: "captions.vtt",
        data: Buffer.from(clip.captions, "utf8"),
      });
    const archive = storedZip(entries);
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === archive.parts.length) {
          controller.close();
          return;
        }
        controller.enqueue(archive.parts[index++]);
      },
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="folio-posting-files.zip"',
        "Content-Length": String(archive.size),
      },
    });
  } catch {
    return Response.json(
      { error: "Could not prepare posting files. Try again." },
      { status: 503, headers },
    );
  }
}
