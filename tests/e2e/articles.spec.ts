import { test, expect, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "article-test-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `articles-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "PRIVATE_ACCOUNT_NAME", email, password },
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
      username: `blog${stamp}${suffix}`,
      publicName: "Public author",
      profilePublic: true,
    },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `articles-${stamp}-` } },
  });
  await db.$disconnect();
});
test("rich text drafts publish separate snapshots and respect blog privacy", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  await page.goto("/creator");
  await page
    .getByRole("button", { name: "Enable public blog", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm blog setting" }).click();
  await expect(
    page.getByRole("button", { name: "Disable public blog", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "New article" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Published essay");
  await page.getByLabel("Summary (optional)").fill("Books & <ideas>");
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("A thoughtful article.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const article = await db.article.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const guest = await browser.newContext();
  const reader = await guest.newPage();
  expect((await reader.goto(`/article/${article.id}`))?.status()).toBe(404);
  await page
    .getByRole("button", { name: "Publish article", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Article published");
  await reader.goto(`/article/${article.id}`);
  await expect(
    reader.getByRole("heading", { name: "Published essay", exact: true }),
  ).toBeVisible();
  await expect(reader.locator("main")).not.toContainText(
    "PRIVATE_ACCOUNT_NAME",
  );
  await page.getByLabel("Title", { exact: true }).fill("SECRET_DRAFT_TITLE");
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("SECRET_DRAFT_BODY");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await reader.reload();
  await expect(reader.locator("main")).toContainText("A thoughtful article.");
  await expect(reader.locator("body")).not.toContainText("SECRET_DRAFT");
  await reader.goto(`/profile/${owner.username}?tab=blog`);
  await expect(
    reader.getByRole("link", { name: "Published essay", exact: true }),
  ).toBeVisible();
  const rss = await reader.request.get(`/blog/${owner.username}/rss`);
  expect(rss.status()).toBe(200);
  expect(await rss.text()).toContain("Books &amp; &lt;ideas&gt;");
  expect(await rss.text()).not.toContain("SECRET_DRAFT");
  await page
    .getByRole("button", { name: "Publish changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Article published");
  await reader.goto(`/article/${article.id}`);
  await expect(
    reader.getByRole("heading", { name: "SECRET_DRAFT_TITLE", exact: true }),
  ).toBeVisible();
  await page.goto("/creator");
  await page
    .getByRole("button", { name: "Disable public blog", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm blog setting" }).click();
  await expect(
    page.getByRole("button", { name: "Enable public blog", exact: true }),
  ).toBeVisible();
  expect((await reader.goto(`/article/${article.id}`))?.status()).toBe(404);
  expect(
    (await reader.request.get(`/blog/${owner.username}/rss`)).status(),
  ).toBe(404);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/creator/${article.id}/edit`);
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/article-editor-mobile.png",
    fullPage: true,
  });
  await guest.close();
});
test("article API rejects unsafe content, foreign writes, stale actions and deleted draft retries", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "api");
  const id = randomUUID();
  const api = `/api/articles/${id}`;
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Safe text", marks: [{ type: "bold" }] },
        ],
      },
    ],
  };
  const draft = { title: "API essay", excerpt: "", content, version: 0 };
  expect((await page.request.put(api, { data: draft })).status()).toBe(200);
  expect((await page.request.put(api, { data: draft })).status()).toBe(200);
  expect(
    (
      await page.request.put(api, {
        data: {
          ...draft,
          version: 1,
          content: {
            type: "doc",
            content: [{ type: "paragraph", attrs: { onclick: "bad" } }],
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(api, { data: { action: "publish", version: 1 } })
    ).status(),
  ).toBe(400);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "other");
  expect(
    (await other.request.put(api, { data: { ...draft, version: 1 } })).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post(api, { data: { action: "delete", version: 1 } })
    ).status(),
  ).toBe(404);
  await db.user.update({
    where: { id: owner.id },
    data: { blogEnabled: true },
  });
  expect(
    (
      await page.request.post(api, { data: { action: "publish", version: 1 } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(api, { data: { action: "delete", version: 1 } })
    ).status(),
  ).toBe(409);
  expect(
    (await page.request.put(api, { data: { ...draft, version: 1 } })).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(api, {
        data: { action: "unpublish", version: 2 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(api, { data: { action: "delete", version: 3 } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(api, { data: { action: "delete", version: 3 } })
    ).status(),
  ).toBe(200);
  expect((await page.request.put(api, { data: draft })).status()).toBe(409);
  const deleted = await db.article.findUniqueOrThrow({ where: { id } });
  expect(deleted.title).toBe("");
  expect(deleted.publishedContent).toBeNull();
  expect(deleted.deletedAt).not.toBeNull();
  await otherContext.close();
});

test("article feeds paginate published snapshots and honor following and profile visibility", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "feed");
  await db.user.update({
    where: { id: owner.id },
    data: { blogEnabled: true },
  });
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Published body" }],
      },
    ],
  };
  await db.article.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      id: randomUUID(),
      userId: owner.id,
      title: "PRIVATE_DRAFT",
      excerpt: "PRIVATE_SUMMARY",
      content,
      isPublic: true,
      publishedTitle: `Public essay ${i}`,
      publishedExcerpt: "Public summary",
      publishedContent: content,
      publishedVersion: 1,
      publishedAt: new Date(Date.now() - i * 1000),
    })),
  });
  const context = await browser.newContext();
  const reader = await context.newPage();
  const follower = await login(reader, "follower");
  await reader.goto("/community/articles?feed=following");
  await expect(
    reader.getByText("No published articles on this page."),
  ).toBeVisible();
  await db.readerFollow.create({
    data: { followerId: follower.id, readerId: owner.id },
  });
  await reader.reload();
  await expect(reader.locator("main article")).toHaveCount(20);
  await expect(reader.locator("main").last()).not.toContainText("PRIVATE_");
  await reader.getByRole("link", { name: "Next", exact: true }).click();
  await expect(reader.locator("main article")).toHaveCount(1);
  await reader.goto(`/profile/${owner.username}?tab=blog`);
  await expect(reader.locator("main article")).toHaveCount(20);
  await reader.getByRole("link", { name: "Next", exact: true }).click();
  await expect(reader.locator("main article")).toHaveCount(1);
  const first = await db.article.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: false },
  });
  expect((await reader.goto(`/article/${first.id}`))?.status()).toBe(404);
  expect(
    (await reader.request.get(`/blog/${owner.username}/rss`)).status(),
  ).toBe(404);
  await reader.goto("/community/articles?feed=following");
  await expect(reader.locator("main article")).toHaveCount(0);
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: true },
  });
  expect((await reader.goto(`/article/${first.id}`))?.status()).toBe(200);
  await expect(reader.locator("main")).toContainText("Published body");
  await context.close();
});
