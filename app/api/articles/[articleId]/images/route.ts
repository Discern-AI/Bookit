import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: { articleId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const article = await prisma.article.findFirst({
    where: { id: params.articleId, userId: session.user.id, deletedAt: null },
    select: { id: true },
  });
  if (!article)
    return Response.json(
      { error: "Save your article before uploading images." },
      { status: 404 },
    );
  let data: Buffer;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(part.value);
    }
    const input = Buffer.concat(chunks);
    const processor = sharp(input, {
      limitInputPixels: 20000000,
      failOn: "warning",
    });
    const meta = await processor.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1
    )
      throw new Error();
    data = await processor
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    if (data.length > 2 * 1024 * 1024) throw new Error();
  } catch {
    return Response.json(
      {
        error:
          "Choose a still JPEG, PNG or WebP image up to 5 MB and 20 megapixels.",
      },
      { status: 400 },
    );
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR NO KEY UPDATE`;
    if (
      !(await tx.article.findFirst({
        where: { id: article.id, userId: session.user.id, deletedAt: null },
      }))
    )
      return null;
    if (
      (await tx.articleImage.count({ where: { articleId: article.id } })) >= 20
    )
      return false;
    return tx.articleImage.create({
      data: { articleId: article.id, data: new Uint8Array(data) },
      select: { id: true },
    });
  });
  if (!result)
    return Response.json(
      {
        error:
          result === false
            ? "This article already has 20 uploaded images. Remove unused uploads first."
            : "Article was deleted.",
      },
      { status: 409 },
    );
  return Response.json({ imageId: result.id }, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: { articleId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const article = await prisma.article.findFirst({
    where: { id: params.articleId, userId: session.user.id, deletedAt: null },
    select: { images: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!article)
    return Response.json({ error: "Article not found." }, { status: 404 });
  return Response.json(article.images, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
