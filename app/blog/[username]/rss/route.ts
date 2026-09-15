import { prisma } from "@/lib/prisma";
import { publishedArticles, escapeXml } from "@/lib/articles";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: { username: string } },
) {
  const user = await prisma.user.findFirst({
    where: {
      username: params.username,
      profilePublic: true,
      blogEnabled: true,
    },
    select: { id: true, publicName: true, username: true },
  });
  if (!user) return new Response("Not found", { status: 404 });
  const articles = await prisma.article.findMany({
    where: { ...publishedArticles, userId: user.id },
    select: {
      id: true,
      publishedTitle: true,
      publishedExcerpt: true,
      publishedAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: 20,
  });
  const origin = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  const profile = escapeXml(`${origin}/profile/${user.username}?tab=blog`);
  const items = articles
    .map((a) => {
      const url = escapeXml(`${origin}/article/${a.id}`);
      return `<item><title>${escapeXml(a.publishedTitle || "")}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${escapeXml(a.publishedExcerpt || "")}</description><pubDate>${a.publishedAt!.toUTCString()}</pubDate></item>`;
    })
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(user.publicName || user.username || "Reader")} on Folio</title><link>${profile}</link><description>Published reader articles</description>${items}</channel></rss>`,
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
