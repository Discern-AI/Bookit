import { resolveArticleEmbeds } from "@/lib/article-embeds";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  articleDraftSchema,
  articleActionSchema,
  parseArticleContent,
  articleText,
  articleFingerprint,
} from "@/lib/articles";
async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > 350000) throw new Error("Too large");
  return JSON.parse(text);
}
export async function PUT(
  request: Request,
  { params }: { params: { articleId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!z.string().uuid().safeParse(params.articleId).success)
    return Response.json({ error: "Invalid article ID." }, { status: 400 });
  let data;
  try {
    const parsed = articleDraftSchema.parse(await readBody(request));
    data = { ...parsed, content: parseArticleContent(parsed.content) };
  } catch {
    return Response.json(
      {
        error:
          "Use a title of 1-160 characters, a summary up to 500 characters and supported rich text up to 50,000 characters.",
      },
      { status: 400 },
    );
  }
  const { version, ...draft } = data;
  const userId = session.user.id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const existing = await tx.article.findUnique({
      where: { id: params.articleId },
    });
    if (existing && existing.userId !== userId)
      return { status: 404, error: "Article not found." };
    if (existing?.deletedAt)
      return {
        status: 409,
        error: "This article was deleted. Start a new draft.",
      };
    try {
      await resolveArticleEmbeds(tx, userId, params.articleId, draft.content);
    } catch (error) {
      return {
        status: 400,
        error:
          error instanceof Error ? error.message : "Invalid article embeds.",
      };
    }
    if (
      existing &&
      version === 0 &&
      existing.version === 1 &&
      existing.title === draft.title &&
      existing.excerpt === draft.excerpt &&
      articleFingerprint(parseArticleContent(existing.content)) ===
        articleFingerprint(draft.content)
    )
      return { status: 200, version: 1, content: existing.content };
    if ((existing?.version ?? 0) !== version)
      return {
        status: 409,
        error:
          "This article changed elsewhere. Reload before saving. Your draft is still here.",
      };
    const content = draft.content as unknown as Prisma.InputJsonValue;
    const article = existing
      ? await tx.article.update({
          where: { id: existing.id },
          data: { ...draft, content, version: { increment: 1 } },
        })
      : await tx.article.create({
          data: { id: params.articleId, userId, ...draft, content },
        });
    return { status: 200, version: article.version, content: article.content };
  });
  return Response.json(result, { status: result.status });
}
export async function POST(
  request: Request,
  { params }: { params: { articleId: string } },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = articleActionSchema.safeParse(
    await readBody(request).catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Choose an action and provide the saved version." },
      { status: 400 },
    );
  const userId = session.user.id;
  const { action, version } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const article = await tx.article.findFirst({
      where: { id: params.articleId, userId },
    });
    if (!article) return { status: 404, error: "Article not found." };
    if (article.deletedAt)
      return action === "delete" && article.version === version + 1
        ? { status: 200, deleted: true }
        : { status: 409, error: "This article was deleted." };
    if (article.version !== version)
      return {
        status: 409,
        error: "This article changed elsewhere. Reload before continuing.",
      };
    if (action === "publish") {
      if (article.isHidden)
        return {
          status: 403,
          error:
            "This article is hidden by moderation. You can edit the draft, but cannot publish it until the restriction is lifted.",
        };
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { blogEnabled: true, profilePublic: true },
      });
      if (!user.blogEnabled || !user.profilePublic)
        return {
          status: 400,
          error:
            "Enable your blog and publish your profile before publishing an article.",
        };
      const text = articleText(parseArticleContent(article.content)).trim();
      if (!text)
        return {
          status: 400,
          error: "Write some article text before publishing.",
        };
      await tx.article.update({
        where: { id: article.id },
        data: {
          isPublic: true,
          publishedTitle: article.title,
          publishedExcerpt: article.excerpt || text.slice(0, 240),
          publishedContent: article.content as Prisma.InputJsonValue,
          publishedVersion: version + 1,
          publishedAt: new Date(),
          publishedReadMinutes: Math.max(
            1,
            Math.ceil(text.split(/\s+/).length / 200),
          ),
          version: { increment: 1 },
        },
      });
    } else if (action === "unpublish")
      await tx.article.update({
        where: { id: article.id },
        data: { isPublic: false, version: { increment: 1 } },
      });
    else {
      await tx.articleImage.deleteMany({ where: { articleId: article.id } });
      await tx.articleAppeal.updateMany({
        where: { articleId: article.id, status: "pending" },
        data: {
          status: "withdrawn",
          response:
            "The author deleted this article. Its content cannot be restored through an appeal.",
          resolvedAt: new Date(),
          resolvedById: userId,
        },
      });
      await tx.article.update({
        where: { id: article.id },
        data: {
          deletedAt: new Date(),
          isPublic: false,
          title: "",
          excerpt: "",
          content: { type: "doc", content: [{ type: "paragraph" }] },
          publishedContent: Prisma.DbNull,
          publishedTitle: null,
          publishedExcerpt: null,
          publishedAt: null,
          publishedVersion: null,
          version: { increment: 1 },
        },
      });
    }
    return {
      status: 200,
      version: version + 1,
      isPublic: action === "publish",
      publishedVersion:
        action === "publish" ? version + 1 : article.publishedVersion,
    };
  });
  return Response.json(result, { status: result.status });
}
