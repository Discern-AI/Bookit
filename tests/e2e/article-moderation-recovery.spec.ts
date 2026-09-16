import { test, expect, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import "dotenv/config";
const stamp = Date.now();
const password = "article-moderation-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `article-mod-${stamp}-${suffix}@example.test`;
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
      username: `am${stamp}${suffix}`,
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
      content: [{ type: "text", text: "Public article text" }],
    },
  ],
};
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `article-mod-${stamp}-` } },
  });
  await db.$disconnect();
});
test("article reports preserve published evidence, enforce stale decisions and gate hidden images and publication", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  const id = randomUUID();
  const article = await db.article.create({
    data: {
      id,
      userId: owner.id,
      title: "PRIVATE_DRAFT_TITLE",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "PRIVATE_DRAFT_BODY" }],
          },
        ],
      },
      isPublic: true,
      publishedTitle: "Reported essay",
      publishedContent: doc,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });
  const image = await db.articleImage.create({
    data: {
      articleId: id,
      data: await sharp({
        create: { width: 5, height: 5, channels: 3, background: "blue" },
      })
        .webp()
        .toBuffer(),
    },
  });
  await db.article.update({
    where: { id },
    data: {
      publishedContent: {
        type: "doc",
        content: [
          ...doc.content,
          {
            type: "articleImage",
            attrs: { imageId: image.id, alt: "Reported image", caption: "" },
          },
        ],
      },
    },
  });
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await login(reader, "reader");
  const reportUrl = `/api/articles/${id}/reports`;
  expect(
    (
      await page.request.post(reportUrl, {
        data: { reason: "spam", details: "Own report", publishedVersion: 1 },
      })
    ).status(),
  ).toBe(400);
  await reader.goto(`/article/${id}`);
  await reader
    .getByRole("button", { name: "Report article", exact: true })
    .click();
  await reader
    .getByLabel("Report details", { exact: true })
    .fill("PRIVATE_REPORT_EXPLANATION");
  await reader
    .getByRole("button", { name: "Submit article report", exact: true })
    .click();
  await expect(reader.getByRole("status")).toContainText("Report submitted");
  expect(
    (
      await reader.request.post(reportUrl, {
        data: { reason: "spam", details: "Retry", publishedVersion: 1 },
      })
    ).status(),
  ).toBe(200);
  const report = await db.articleReport.findFirstOrThrow({
    where: { articleId: id },
  });
  expect(await db.articleReport.count({ where: { articleId: id } })).toBe(1);
  expect(JSON.stringify(report.snapshot)).not.toContain("PRIVATE_DRAFT");
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await login(mod, "moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const moderation = `/api/moderation/articles/${report.id}`;
  const decision = {
    action: "hide",
    version: 1,
    note: "Confirmed spam in publication",
  };
  expect(
    (await reader.request.patch(moderation, { data: decision })).status(),
  ).toBe(403);
  await mod.goto("/community/moderation/articles");
  await expect(mod.locator("body")).toContainText("PRIVATE_REPORT_EXPLANATION");
  await expect(mod.locator("body")).not.toContainText("PRIVATE_DRAFT");
  await db.article.update({
    where: { id },
    data: { version: { increment: 1 } },
  });
  expect(
    (await mod.request.patch(moderation, { data: decision })).status(),
  ).toBe(409);
  await mod.reload();
  await mod.getByRole("button", { name: "Hide article", exact: true }).click();
  await mod.getByLabel("Decision note", { exact: true }).fill(decision.note);
  await mod.getByRole("button", { name: "Confirm hide", exact: true }).click();
  await expect(mod.getByText("No article reports on this page.")).toBeVisible();
  expect((await reader.goto(`/article/${id}`))?.status()).toBe(404);
  expect(
    (await reader.request.get(`/api/article-images/${image.id}`)).status(),
  ).toBe(404);
  expect(
    (await mod.request.get(`/api/article-images/${image.id}`)).status(),
  ).toBe(200);
  await reader.goto(`/profile/${owner.username}?tab=blog`);
  await expect(reader.locator("main article")).toHaveCount(0);
  expect(
    await (await reader.request.get(`/blog/${owner.username}/rss`)).text(),
  ).not.toContain("Reported essay");
  expect(
    (
      await page.request.post(`/api/articles/${id}`, {
        data: { action: "publish", version: 3 },
      })
    ).status(),
  ).toBe(403);
  await page.goto(`/creator/${id}/edit`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Hidden by moderation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish changes", exact: true }),
  ).toBeDisabled();
  await mod.goto("/community/moderation/articles?status=resolved");
  await mod
    .getByRole("button", { name: "Lift article restriction", exact: true })
    .click();
  await mod
    .getByLabel("Decision note", { exact: true })
    .fill("Restriction lifted after review");
  await mod
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(
    mod.getByText("Restoration: Restriction lifted after review", {
      exact: true,
    }),
  ).toBeVisible();
  const restored = await db.article.findUniqueOrThrow({ where: { id } });
  expect(restored.isHidden).toBe(false);
  expect(restored.isPublic).toBe(false);
  expect((await reader.goto(`/article/${id}`))?.status()).toBe(404);
  await mod.setViewportSize({ width: 390, height: 844 });
  await mod.screenshot({
    path: "test-results/article-moderation-mobile.png",
    fullPage: true,
  });
  const resolved = await db.articleReport.findUniqueOrThrow({
    where: { id: report.id },
  });
  expect(resolved.resolvedById).toBe(moderator.id);
  expect(resolved.restoredById).toBe(moderator.id);
  expect(
    (
      await mod.request.patch(moderation, {
        data: { action: "restore", version: 4, note: "Duplicate restoration" },
      })
    ).status(),
  ).toBe(409);
  await readerContext.close();
  await modContext.close();
});
test("deleted article report retains text evidence and can be dismissed without restoration", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "deleted");
  const id = randomUUID();
  await db.article.create({
    data: {
      id,
      userId: owner.id,
      title: "Deleted draft",
      content: doc,
      isPublic: true,
      publishedTitle: "Deleted publication",
      publishedContent: doc,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });
  const context = await browser.newContext();
  const mod = await context.newPage();
  const user = await login(mod, "delete_mod");
  await db.user.update({ where: { id: user.id }, data: { isModerator: true } });
  expect(
    (
      await mod.request.post(`/api/articles/${id}/reports`, {
        data: { reason: "other", details: "Explanation", publishedVersion: 2 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await mod.request.post(`/api/articles/${id}/reports`, {
        data: { reason: "other", details: "Explanation", publishedVersion: 1 },
      })
    ).status(),
  ).toBe(201);
  const report = await db.articleReport.findFirstOrThrow({
    where: { articleId: id },
  });
  expect(
    (
      await page.request.post(`/api/articles/${id}`, {
        data: { action: "delete", version: 1 },
      })
    ).status(),
  ).toBe(200);
  const url = `/api/moderation/articles/${report.id}`;
  expect(
    (
      await mod.request.patch(url, {
        data: { action: "hide", version: 2, note: "Hide deleted article" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await mod.request.patch(url, {
        data: {
          action: "dismiss",
          version: 2,
          note: "Author deleted the article",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    JSON.stringify(
      (await db.articleReport.findUniqueOrThrow({ where: { id: report.id } }))
        .snapshot,
    ),
  ).toContain("Public article text");
  expect(
    (
      await mod.request.patch(url, {
        data: {
          action: "restore",
          version: 2,
          note: "Cannot restore deletion",
        },
      })
    ).status(),
  ).toBe(409);
  await context.close();
});
test("opt-in browser recovery restores new and saved drafts, rejects stale copies and stays account scoped", async ({
  page,
}) => {
  const owner = await login(page, "recovery");
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/creator/new");
  await page
    .getByRole("checkbox", { name: "Keep a recovery copy on this browser" })
    .check();
  await page.getByLabel("Title", { exact: true }).fill("Recovered new essay");
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("Unsaved browser copy");
  await expect(
    page.getByRole("region", { name: "Draft recovery" }),
  ).toContainText("Recovery copy saved");
  await page.reload();
  await expect(
    page.getByText("Unsaved recovery copy found: Recovered new essay.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore recovery copy", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Recovered new essay",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/creator\/[^/]+\/edit\?saved=1$/);
  const article = await db.article.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("Recover edited draft");
  await page.reload();
  await page
    .getByRole("button", { name: "Restore recovery copy", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toContainText("Recover edited draft");
  await db.article.update({
    where: { id: article.id },
    data: { title: "Newer server draft", version: { increment: 1 } },
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Restore recovery copy", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Newer server draft",
  );
  await page
    .getByRole("button", { name: "Discard recovery copy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore recovery copy", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Title", { exact: true })
    .fill("Account-private local draft");
  await page.goto("/creator/new");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Account-private new draft");
  await expect(
    page.getByRole("region", { name: "Draft recovery" }),
  ).toContainText("Recovery copy saved");
  const anotherTab = await page.context().newPage();
  await anotherTab.goto(`/creator/${article.id}/edit`);
  await expect(
    anotherTab.getByRole("checkbox", {
      name: "Keep a recovery copy on this browser",
    }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Keep a recovery copy on this browser" })
    .uncheck();
  await expect(
    anotherTab.getByRole("checkbox", {
      name: "Keep a recovery copy on this browser",
    }),
  ).not.toBeChecked();
  await anotherTab
    .getByLabel("Title", { exact: true })
    .fill("No recovery after opt out");
  expect(
    await anotherTab.evaluate(
      (id) =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith(`folio:article-recovery:${id}:`),
        ).length,
      owner.id,
    ),
  ).toBe(0);
  await anotherTab.close();
  await page
    .getByRole("checkbox", { name: "Keep a recovery copy on this browser" })
    .check();
  await expect(
    page.getByRole("region", { name: "Draft recovery" }),
  ).toContainText("Recovery copy saved");
  await login(page, "different");
  await page.goto("/creator/new");
  await expect(page.locator("body")).not.toContainText("Account-private");
  await expect(
    page.getByRole("checkbox", {
      name: "Keep a recovery copy on this browser",
    }),
  ).not.toBeChecked();
  await page.screenshot({
    path: "test-results/article-recovery.png",
    fullPage: true,
  });
});
