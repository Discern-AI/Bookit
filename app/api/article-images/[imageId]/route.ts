import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { articleNodes, parseArticleContent } from "@/lib/articles";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: { imageId: string } },
) {
  const image = await prisma.articleImage.findUnique({
    where: { id: params.imageId },
    select: {
      article: {
        select: {
          userId: true,
          deletedAt: true,
          isPublic: true,
          publishedContent: true,
          user: { select: { profilePublic: true, blogEnabled: true } },
        },
      },
    },
  });
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!image || image.article.deletedAt)
    return new Response("Not found", { status: 404, headers });
  const a = image.article;
  const published =
    a.isPublic &&
    a.user.profilePublic &&
    a.user.blogEnabled &&
    a.publishedContent &&
    articleNodes(parseArticleContent(a.publishedContent), "articleImage").some(
      (n) => n.attrs!.imageId === params.imageId,
    );
  if (!published) {
    const session = await auth();
    if (session?.user?.id !== a.userId)
      return new Response("Not found", { status: 404, headers });
  }
  const bytes = await prisma.articleImage.findUnique({
    where: { id: params.imageId },
    select: { data: true },
  });
  if (!bytes) return new Response("Not found", { status: 404, headers });
  return new Response(new Uint8Array(bytes.data), {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Content-Disposition": "inline",
    },
  });
}
export async function DELETE(
  _request: Request,
  { params }: { params: { imageId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR NO KEY UPDATE`;
    const image = await tx.articleImage.findFirst({
      where: {
        id: params.imageId,
        article: { userId: session.user.id, deletedAt: null },
      },
      select: {
        article: { select: { content: true, publishedContent: true } },
      },
    });
    if (!image) return { status: 404, error: "Image not found." };
    if (
      [image.article.content, image.article.publishedContent]
        .filter(Boolean)
        .some((doc) =>
          articleNodes(parseArticleContent(doc), "articleImage").some(
            (n) => n.attrs!.imageId === params.imageId,
          ),
        )
    )
      return {
        status: 409,
        error:
          "Remove the image from the saved draft and publish those changes before deleting the upload.",
      };
    await tx.articleImage.delete({ where: { id: params.imageId } });
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
