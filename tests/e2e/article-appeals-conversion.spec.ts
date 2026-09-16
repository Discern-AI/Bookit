import { test, expect, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import "dotenv/config";
const stamp = Date.now();
const password = "article-appeals-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `article-appeals-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "PRIVATE_ACCOUNT", email, password },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password },
  });
  return db.user.update({
    where: { email },
    data: {
      username: `aa${stamp}${suffix}`,
      publicName: "Public author",
      profilePublic: true,
      blogEnabled: true,
    },
  });
}
const doc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Published appeal evidence" }],
    },
  ],
};
async function hidden(userId: string, title = "Hidden article") {
  return db.article.create({
    data: {
      id: randomUUID(),
      userId,
      title: "PRIVATE_DRAFT_TITLE",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "PRIVATE_DRAFT_TEXT" }],
          },
        ],
      },
      isPublic: true,
      isHidden: true,
      moderationVersion: 1,
      publishedTitle: title,
      publishedContent: doc,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `article-appeals-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Conversion ${stamp}` } },
  });
  await db.$disconnect();
});
test("review conversion creates a private independent draft with idempotent and ownership checks", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "convert");
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: false, blogEnabled: false },
  });
  const work = await db.work.create({
    data: {
      title: `Conversion ${stamp} book`,
      authorName: "Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "paperback",
          userBooks: {
            create: {
              userId: owner.id,
              shelf: "read",
              privateNotes: "PRIVATE_LIBRARY_NOTES",
              importedReview: "PRIVATE_IMPORT_REVIEW",
            },
          },
        },
      },
    },
  });
  const review = await db.bookReview.create({
    data: {
      userId: owner.id,
      workId: work.id,
      body: "Review first paragraph.\n\n<script>Literal second paragraph.</script>",
      rating: 5,
      isPublic: false,
    },
  });
  await page.goto("/community/reviews");
  await page
    .getByRole("button", { name: "Turn into article", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create private article draft", exact: true })
    .click();
  await expect(page).toHaveURL(/\/creator\/[^/]+\/edit$/);
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toContainText("Literal second paragraph");
  const article = await db.article.findFirstOrThrow({
    where: { sourceReviewId: review.id },
  });
  expect(article.isPublic).toBe(false);
  expect(article.publishedContent).toBeNull();
  expect(JSON.stringify(article.content)).not.toContain(
    "PRIVATE_LIBRARY_NOTES",
  );
  expect(JSON.stringify(article.content)).not.toContain(
    "PRIVATE_IMPORT_REVIEW",
  );
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: review.id } })).body,
  ).toBe(review.body);
  const url = `/api/articles/from-review/${review.id}`;
  const retry = await page.request.post(url, { data: { version: 1 } });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).id).toBe(article.id);
  expect(await db.article.count({ where: { sourceReviewId: review.id } })).toBe(
    1,
  );
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, "foreign");
  expect(
    (await other.request.post(url, { data: { version: 1 } })).status(),
  ).toBe(404);
  expect((await other.goto(`/article/${article.id}`))?.status()).toBe(404);
  await db.bookReview.update({
    where: { id: review.id },
    data: { version: 2, body: "A revised review" },
  });
  expect(
    (await page.request.post(url, { data: { version: 1 } })).status(),
  ).toBe(409);
  expect(
    (await page.request.post(url, { data: { version: 2 } })).status(),
  ).toBe(201);
  expect(
    (await db.article.findUniqueOrThrow({ where: { id: article.id } })).version,
  ).toBe(1);
  await db.bookReview.update({
    where: { id: review.id },
    data: { isHidden: true },
  });
  expect(
    (await page.request.post(url, { data: { version: 2 } })).status(),
  ).toBe(403);
  await db.bookReview.update({
    where: { id: review.id },
    data: { isHidden: false, version: 1 },
  });
  expect(
    (
      await page.request.post(`/api/articles/${article.id}`, {
        data: { action: "delete", version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.post(url, { data: { version: 1 } })).status(),
  ).toBe(409);
  await db.bookReview.update({
    where: { id: review.id },
    data: { deletedAt: new Date(), active: null, body: "" },
  });
  expect(
    (await page.request.post(url, { data: { version: 1 } })).status(),
  ).toBe(404);
  await context.close();
});
test("article appeals are private, reject stale decisions and restore without publication", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "appeal");
  const article = await hidden(owner.id);
  const image = await db.articleImage.create({
    data: {
      articleId: article.id,
      data: await sharp({
        create: { width: 10, height: 10, channels: 3, background: "blue" },
      })
        .webp()
        .toBuffer(),
    },
  });
  await db.article.update({
    where: { id: article.id },
    data: {
      publishedContent: {
        type: "doc",
        content: [
          ...doc.content,
          {
            type: "articleImage",
            attrs: { imageId: image.id, alt: "Appeal image", caption: "" },
          },
        ],
      },
    },
  });
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "reader");
  const url = `/api/articles/${article.id}/appeals`;
  const reason = "PRIVATE_APPEAL Please reconsider this restriction.";
  expect(
    (
      await other.request.post(url, { data: { reason, moderationVersion: 1 } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post(url, {
        data: { reason: "short", moderationVersion: 1 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(url, { data: { reason, moderationVersion: 0 } })
    ).status(),
  ).toBe(409);
  await page.goto(`/creator/${article.id}/edit`);
  await page
    .getByRole("button", { name: "Appeal article restriction", exact: true })
    .click();
  await page.getByLabel("Appeal explanation", { exact: true }).fill(reason);
  await page
    .getByRole("button", { name: "Submit article appeal", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Appeal submitted privately",
  );
  expect(
    (
      await page.request.post(url, { data: { reason, moderationVersion: 1 } })
    ).status(),
  ).toBe(200);
  const appeal = await db.articleAppeal.findFirstOrThrow({
    where: { articleId: article.id },
  });
  expect(
    await db.articleAppeal.count({ where: { articleId: article.id } }),
  ).toBe(1);
  expect(JSON.stringify(appeal.snapshot)).not.toContain("PRIVATE_DRAFT");
  await other.goto("/creator/appeals");
  await expect(other.locator("body")).not.toContainText("PRIVATE_APPEAL");
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await login(mod, "moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const decision = `/api/moderation/article-appeals/${appeal.id}`;
  const response = "Restriction lifted after considering the explanation.";
  expect(
    (
      await other.request.patch(decision, {
        data: { action: "restore", version: 1, response },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await other.request.get(`/api/article-images/${image.id}`)).status(),
  ).toBe(404);
  expect(
    (await mod.request.get(`/api/article-images/${image.id}`)).status(),
  ).toBe(200);
  await mod.goto("/community/moderation/article-appeals");
  await expect(mod.locator("body")).toContainText("PRIVATE_APPEAL");
  await expect(mod.locator("body")).not.toContainText("PRIVATE_DRAFT");
  await db.article.update({
    where: { id: article.id },
    data: { version: { increment: 1 } },
  });
  expect(
    (
      await mod.request.patch(decision, {
        data: { action: "restore", version: 1, response },
      })
    ).status(),
  ).toBe(409);
  await mod.reload();
  await mod
    .getByRole("button", { name: "Approve article appeal", exact: true })
    .click();
  await mod.getByLabel("Appeal response", { exact: true }).fill(response);
  await mod
    .getByRole("button", { name: "Confirm appeal restore", exact: true })
    .click();
  await expect(
    mod.getByText("No article appeals on this page.", { exact: true }),
  ).toBeVisible();
  const restored = await db.article.findUniqueOrThrow({
    where: { id: article.id },
  });
  expect(restored.isHidden).toBe(false);
  expect(restored.isPublic).toBe(false);
  expect((await other.goto(`/article/${article.id}`))?.status()).toBe(404);
  const resolved = await db.articleAppeal.findUniqueOrThrow({
    where: { id: appeal.id },
  });
  expect(resolved.resolvedById).toBe(moderator.id);
  expect(resolved.status).toBe("restored");
  await page.goto("/creator/appeals");
  await expect(
    page.getByText(`Response: ${response}`, { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/article-appeals-mobile.png",
    fullPage: true,
  });
  await otherContext.close();
  await modContext.close();
});
test("new restrictions supersede pending appeals, rejection stays closed and deletion withdraws appeals", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "states");
  const context = await browser.newContext();
  const mod = await context.newPage();
  const moderator = await login(mod, "state_mod");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const article = await hidden(owner.id, "State article");
  const url = `/api/articles/${article.id}/appeals`;
  const reason = "Please reconsider the article restriction.";
  expect(
    (
      await page.request.post(url, { data: { reason, moderationVersion: 1 } })
    ).status(),
  ).toBe(201);
  const first = await db.articleAppeal.findFirstOrThrow({
    where: { articleId: article.id },
  });
  const report = await db.articleReport.create({
    data: {
      articleId: article.id,
      reporterId: moderator.id,
      publishedVersion: 1,
      title: "State article",
      snapshot: doc,
      imageIds: [],
      reason: "spam",
      details: "Another decision",
    },
  });
  expect(
    (
      await mod.request.patch(`/api/moderation/articles/${report.id}`, {
        data: {
          action: "hide",
          version: 1,
          note: "A newer moderation decision",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await db.articleAppeal.findUniqueOrThrow({ where: { id: first.id } }))
      .status,
  ).toBe("superseded");
  expect(
    (
      await mod.request.patch(`/api/moderation/article-appeals/${first.id}`, {
        data: {
          action: "restore",
          version: 2,
          response: "Stale decision rejected",
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(url, { data: { reason, moderationVersion: 2 } })
    ).status(),
  ).toBe(201);
  const second = await db.articleAppeal.findUniqueOrThrow({
    where: {
      articleId_moderationVersion: {
        articleId: article.id,
        moderationVersion: 2,
      },
    },
  });
  expect(
    (
      await mod.request.patch(`/api/moderation/article-appeals/${second.id}`, {
        data: {
          action: "reject",
          version: 2,
          response: "Restriction remains appropriate.",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(url, { data: { reason, moderationVersion: 2 } })
    ).status(),
  ).toBe(409);
  expect(
    (await db.article.findUniqueOrThrow({ where: { id: article.id } }))
      .isHidden,
  ).toBe(true);
  const deleted = await hidden(owner.id, "Deleted appeal");
  await page.request.post(`/api/articles/${deleted.id}/appeals`, {
    data: { reason, moderationVersion: 1 },
  });
  const pending = await db.articleAppeal.findFirstOrThrow({
    where: { articleId: deleted.id },
  });
  expect(
    (
      await page.request.post(`/api/articles/${deleted.id}`, {
        data: { action: "delete", version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await db.articleAppeal.findUniqueOrThrow({ where: { id: pending.id } }))
      .status,
  ).toBe("withdrawn");
  expect(
    (
      await mod.request.patch(`/api/moderation/article-appeals/${pending.id}`, {
        data: {
          action: "restore",
          version: 2,
          response: "Cannot restore deletion",
        },
      })
    ).status(),
  ).toBe(409);
  const direct = await hidden(owner.id, "Direct restoration");
  await page.request.post(`/api/articles/${direct.id}/appeals`, {
    data: { reason, moderationVersion: 1 },
  });
  const directReport = await db.articleReport.create({
    data: {
      articleId: direct.id,
      reporterId: moderator.id,
      publishedVersion: 1,
      title: "Direct restoration",
      snapshot: doc,
      imageIds: [],
      reason: "spam",
      details: "",
      status: "hidden",
      decisionVersion: 1,
    },
  });
  expect(
    (
      await mod.request.patch(`/api/moderation/articles/${directReport.id}`, {
        data: {
          action: "restore",
          version: 1,
          note: "Restriction lifted directly",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await db.articleAppeal.findFirstOrThrow({
        where: { articleId: direct.id },
      })
    ).status,
  ).toBe("restored");
  await context.close();
});
