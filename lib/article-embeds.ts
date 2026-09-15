import type { Prisma } from "@prisma/client";
import { articleNodes, ArticleNode } from "./articles";
export function bookAttributes(edition: {
  id: string;
  coverUrl: string | null;
  work: { id: string; title: string; authorName: string };
}) {
  return {
    editionId: edition.id,
    workId: edition.work.id,
    title: edition.work.title.slice(0, 500),
    authorName: edition.work.authorName.slice(0, 500),
    coverUrl:
      edition.coverUrl &&
      /^https:\/\/covers\.openlibrary\.org\/[^?#]+$/.test(edition.coverUrl)
        ? edition.coverUrl
        : "",
  };
}
export async function resolveArticleEmbeds(
  tx: Prisma.TransactionClient,
  userId: string,
  articleId: string,
  content: ArticleNode,
) {
  const images = articleNodes(content, "articleImage");
  const imageIds = [...new Set(images.map((n) => String(n.attrs!.imageId)))];
  if (
    imageIds.length !==
    (await tx.articleImage.count({
      where: {
        id: { in: imageIds },
        articleId,
        article: { userId, deletedAt: null },
      },
    }))
  )
    throw new Error("An image is unavailable or belongs to another article.");
  const cards = articleNodes(content, "bookCard");
  const editionIds = [...new Set(cards.map((n) => String(n.attrs!.editionId)))];
  const books = await tx.userBook.findMany({
    where: { userId, editionId: { in: editionIds } },
    select: {
      edition: {
        select: {
          id: true,
          coverUrl: true,
          work: { select: { id: true, title: true, authorName: true } },
        },
      },
    },
  });
  if (books.length !== editionIds.length)
    throw new Error(
      "An embedded book is no longer in your collection. Remove that card or add the book back before saving.",
    );
  const byId = new Map(
    books.map((b) => [b.edition.id, bookAttributes(b.edition)]),
  );
  for (const card of cards)
    card.attrs = byId.get(String(card.attrs!.editionId))!;
  return content;
}
