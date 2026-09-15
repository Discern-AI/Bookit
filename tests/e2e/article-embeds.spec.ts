import { test, expect, Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import "dotenv/config";
const stamp = Date.now();
const password = "article-embeds-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `article-embeds-${stamp}-${suffix}@example.test`;
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
      username: `embeds${stamp}${suffix}`,
      publicName: "Public author",
      profilePublic: true,
      blogEnabled: true,
    },
  });
}
const text = {
  type: "paragraph",
  content: [{ type: "text", text: "An illustrated essay." }],
};
const doc = { type: "doc", content: [text] };
async function photo() {
  return sharp({
    create: {
      width: 1800,
      height: 1000,
      channels: 3,
      background: { r: 80, g: 100, b: 120 },
    },
  })
    .withMetadata({ exif: { IFD0: { Artist: "PRIVATE_PHOTO_METADATA" } } })
    .jpeg()
    .toBuffer();
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `article-embeds-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Embed ${stamp}` } },
  });
  await db.$disconnect();
});
test("editor inserts image and collection card, strips photo metadata and publishes only saved embeds", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "ui");
  const work = await db.work.create({
    data: {
      title: `Embed ${stamp} selected book`,
      authorName: "Catalogue author",
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
              privateNotes: "PRIVATE_LIBRARY_NOTE",
              rating: 4,
            },
          },
        },
      },
    },
  });
  await page.goto("/creator/new");
  await page.getByLabel("Title", { exact: true }).fill("Illustrated essay");
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("An illustrated essay.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const article = await db.article.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await page.getByRole("button", { name: "Insert image", exact: true }).click();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await photo(),
  });
  await page
    .getByLabel("Image description", { exact: true })
    .fill("A slate blue illustration");
  await page.getByLabel("Caption (optional)").fill("My illustration");
  await page
    .getByRole("button", { name: "Add image to draft", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByRole("textbox", { name: "Article body" })
      .getByRole("img", { name: "A slate blue illustration" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Insert book card", exact: true })
    .click();
  await page
    .getByLabel("Search collection", { exact: true })
    .fill(`Embed ${stamp}`);
  await page.getByRole("button", { name: "Search books", exact: true }).click();
  await page
    .getByRole("button", {
      name: `${work.title} / Catalogue author`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const image = await db.articleImage.findFirstOrThrow({
    where: { articleId: article.id },
  });
  const metadata = await sharp(Buffer.from(image.data)).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(1600);
  expect(metadata.exif).toBeUndefined();
  const guest = await browser.newContext();
  const reader = await guest.newPage();
  expect(
    (await reader.request.get(`/api/article-images/${image.id}`)).status(),
  ).toBe(404);
  await page
    .getByRole("button", { name: "Publish article", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Article published");
  await reader.goto(`/article/${article.id}`);
  await expect(
    reader.getByRole("img", { name: "A slate blue illustration", exact: true }),
  ).toBeVisible();
  await expect(
    reader.getByRole("link", { name: new RegExp(work.title) }),
  ).toHaveAttribute("href", `/book/${work.id}`);
  await expect(reader.locator("body")).not.toContainText("PRIVATE_");
  const response = await reader.request.get(`/api/article-images/${image.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-type"]).toBe("image/webp");
  await reader.setViewportSize({ width: 390, height: 844 });
  await reader.screenshot({
    path: "test-results/article-embeds-mobile.png",
    fullPage: true,
  });
  expect(
    await reader.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/creator/${article.id}/edit`);
  await expect(
    page.getByRole("textbox", { name: "Article body" }).getByRole("img"),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toContainText(work.title);
  await db.user.update({
    where: { id: owner.id },
    data: { blogEnabled: false },
  });
  expect(
    (await reader.request.get(`/api/article-images/${image.id}`)).status(),
  ).toBe(404);
  await guest.close();
});
test("image APIs enforce ownership, publication references, input limits and safe cleanup", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "api");
  const id = randomUUID();
  const api = `/api/articles/${id}`;
  const draft = {
    title: "Image API essay",
    excerpt: "",
    content: doc,
    version: 0,
  };
  expect((await page.request.put(api, { data: draft })).status()).toBe(200);
  const upload = `${api}/images`;
  expect(
    (
      await page.request.post(upload, {
        data: "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(upload, {
        data: Buffer.alloc(5 * 1024 * 1024 + 1),
      })
    ).status(),
  ).toBe(400);
  const valid = await page.request.post(upload, { data: await photo() });
  expect(valid.status()).toBe(201);
  const { imageId } = await valid.json();
  const imageUrl = `/api/article-images/${imageId}`;
  const imageNode = {
    type: "articleImage",
    attrs: { imageId, alt: "Photo", caption: "" },
  };
  const imageDoc = { type: "doc", content: [text, imageNode] };
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "other");
  expect((await other.request.get(imageUrl)).status()).toBe(404);
  expect((await other.request.delete(imageUrl)).status()).toBe(404);
  expect(
    (await other.request.post(upload, { data: await photo() })).status(),
  ).toBe(404);
  const otherId = randomUUID();
  expect(
    (
      await other.request.put(`/api/articles/${otherId}`, {
        data: { ...draft, content: imageDoc },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.put(api, {
        data: { ...draft, version: 1, content: imageDoc },
      })
    ).status(),
  ).toBe(200);
  expect((await page.request.delete(imageUrl)).status()).toBe(409);
  expect(
    (
      await page.request.post(api, { data: { action: "publish", version: 2 } })
    ).status(),
  ).toBe(200);
  expect((await other.request.get(imageUrl)).status()).toBe(200);
  const unpublished = await page.request.post(upload, { data: await photo() });
  const pending = (await unpublished.json()).imageId;
  expect(
    (await other.request.get(`/api/article-images/${pending}`)).status(),
  ).toBe(404);
  expect(
    (await page.request.delete(`/api/article-images/${pending}`)).status(),
  ).toBe(200);
  expect(
    (await page.request.put(api, { data: { ...draft, version: 3 } })).status(),
  ).toBe(200);
  expect((await other.request.get(imageUrl)).status()).toBe(200);
  expect((await page.request.delete(imageUrl)).status()).toBe(409);
  expect(
    (
      await page.request.post(api, { data: { action: "publish", version: 4 } })
    ).status(),
  ).toBe(200);
  expect((await other.request.get(imageUrl)).status()).toBe(404);
  expect((await page.request.delete(imageUrl)).status()).toBe(200);
  const last = await page.request.post(upload, { data: await photo() });
  const lastId = (await last.json()).imageId;
  const stored = await db.articleImage.findUniqueOrThrow({
    where: { id: lastId },
  });
  await db.articleImage.createMany({
    data: Array.from({ length: 19 }, () => ({
      id: randomUUID(),
      articleId: id,
      data: stored.data,
    })),
  });
  expect(
    (await page.request.post(upload, { data: await photo() })).status(),
  ).toBe(409);
  expect(await db.articleImage.count({ where: { articleId: id } })).toBe(20);

  expect(
    (
      await page.request.post(api, { data: { action: "delete", version: 5 } })
    ).status(),
  ).toBe(200);
  expect(await db.articleImage.count({ where: { articleId: id } })).toBe(0);
  expect(
    (await page.request.get(`/api/article-images/${lastId}`)).status(),
  ).toBe(404);
  await otherContext.close();
});
test("book card selection paginates only owned books and canonicalizes public details", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "cards");
  const ids: string[] = [];
  for (let i = 0; i < 21; i++) {
    const work = await db.work.create({
      data: {
        title: `Embed ${stamp} card ${i}`,
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
                privateNotes: "PRIVATE_NOTES",
              },
            },
          },
        },
      },
      include: { editions: true },
    });
    ids.push(work.editions[0].id);
  }
  const first = await page.request.get(
    `/api/articles/books?q=${encodeURIComponent(`Embed ${stamp}`)}`,
  );
  const list = await first.json();
  expect(list.books).toHaveLength(20);
  expect(list.hasNext).toBe(true);
  expect(await first.text()).not.toContain("PRIVATE_NOTES");
  const second = await (
    await page.request.get(
      `/api/articles/books?q=${encodeURIComponent(`Embed ${stamp}`)}&page=2`,
    )
  ).json();
  expect(second.books).toHaveLength(1);
  const selected = list.books[0];
  const id = randomUUID();
  const api = `/api/articles/${id}`;
  const card = {
    type: "bookCard",
    attrs: { ...selected, title: "FORGED_TITLE", authorName: "FORGED_AUTHOR" },
  };
  const payload = {
    title: "Book essay",
    excerpt: "",
    content: { type: "doc", content: [text, card] },
    version: 0,
  };
  const saved = await page.request.put(api, { data: payload });
  expect(saved.status()).toBe(200);
  expect(JSON.stringify((await saved.json()).content)).not.toContain("FORGED_");
  expect((await page.request.put(api, { data: payload })).status()).toBe(200);
  const foreignContext = await browser.newContext();
  const foreign = await foreignContext.newPage();
  await login(foreign, "foreign");
  expect(
    (await (await foreign.request.get("/api/articles/books")).json()).books,
  ).toHaveLength(0);
  expect(
    (
      await foreign.request.put(`/api/articles/${randomUUID()}`, {
        data: payload,
      })
    ).status(),
  ).toBe(400);
  await db.userBook.deleteMany({
    where: { userId: owner.id, editionId: selected.editionId },
  });
  expect(
    (
      await page.request.put(api, { data: { ...payload, version: 1 } })
    ).status(),
  ).toBe(400);
  await foreignContext.close();
});
