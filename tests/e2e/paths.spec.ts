import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
const stamp = Date.now();
const prefix = `Path E2E ${stamp}`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `folio-path-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Path reader", email, password: "path-test-password" },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "path-test-password" },
  });
  return (await db.user.findUniqueOrThrow({ where: { email } })).id;
}
async function work(suffix: string) {
  return db.work.create({
    data: {
      title: `${prefix} ${suffix}`,
      authorName: "Path Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: { create: { format: "paperback", pageCount: 200 } },
    },
    include: { editions: true },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `folio-path-${stamp}-` } },
  });
  await db.work.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.$disconnect();
});
test("paths preserve order, publish explicitly, follow and become private again", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const owner = await login(page, "owner");
  const first = await work("First");
  const second = await work("Second");
  await db.userBook.create({
    data: {
      userId: owner,
      editionId: first.editions[0].id,
      shelf: "tbr",
      privateNotes: "PRIVATE_LIBRARY_THOUGHT",
    },
  });
  await page.goto("/browse");
  await page.getByRole("link", { name: "Create a path", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Path title", exact: true })
    .fill(`${prefix} Secret journey`);
  await page
    .getByRole("textbox", { name: "Path description", exact: true })
    .fill("An ordered journey.");
  await page
    .getByRole("textbox", { name: "Search catalogue for path", exact: true })
    .fill(prefix);
  await page
    .getByRole("button", { name: `Add ${first.title} to path`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `Add ${second.title} to path`, exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: `Add ${first.title} to path`,
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: `Note for ${second.title}`, exact: true })
    .fill("Start with this perspective.");
  await page
    .getByRole("button", { name: `Move ${second.title} up`, exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Publish this path", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  await expect(page).toHaveURL(/\/path\//);
  const path = await db.readingPath.findFirstOrThrow({
    where: { userId: owner },
    include: { entries: { orderBy: { position: "asc" } } },
  });
  expect(path.isPublic).toBe(false);
  expect(path.entries.map((e) => e.workId)).toEqual([second.id, first.id]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: `1. ${second.title}`, exact: true }),
  ).toBeVisible();
  const anonymous = await browser.newContext();
  const anon = await anonymous.newPage();
  let response = await anon.goto(`/path/${path.id}`);
  expect(response?.status()).toBe(404);
  expect(await response!.text()).not.toContain("Secret journey");
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const follower = await login(other, "follower");
  expect((await other.goto(`/path/${path.id}`))?.status()).toBe(404);
  expect(
    (await other.request.put(`/api/paths/${path.id}/follow`)).status(),
  ).toBe(404);
  const update = {
    title: path.title,
    description: path.description,
    isPublic: true,
    version: path.version,
    entries: path.entries.map((e) => ({ workId: e.workId, note: e.note })),
  };
  expect(
    (
      await other.request.patch(`/api/paths/${path.id}`, { data: update })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.delete(`/api/paths/${path.id}`, {
        data: { version: path.version },
      })
    ).status(),
  ).toBe(404);
  await page.getByRole("link", { name: "Edit path", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Publish this path", exact: true })
    .check();
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  await expect(
    page.getByText("Public reading path", { exact: false }),
  ).toBeVisible();
  response = await anon.goto(`/path/${path.id}`);
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).toContain("Start with this perspective.");
  expect(html).not.toContain("PRIVATE_LIBRARY_THOUGHT");
  expect(html).not.toContain("@example.test");
  await anon.goto(`/book/${first.id}`);
  await expect(
    anon.getByRole("heading", { name: path.title, exact: true }),
  ).toBeVisible();
  await other.goto(`/path/${path.id}`);
  await other.getByRole("button", { name: "Follow path", exact: true }).click();
  await expect(
    other.getByRole("button", { name: "Unfollow path", exact: true }),
  ).toBeVisible();
  await other.request.put(`/api/paths/${path.id}/follow`);
  expect(
    await db.readingPathFollow.count({
      where: { userId: follower, pathId: path.id },
    }),
  ).toBe(1);
  await other.goto("/browse/paths?view=following");
  await expect(
    other.getByRole("heading", { name: path.title, exact: true }),
  ).toBeVisible();
  await other.goto(`/path/${path.id}`);
  await other
    .getByRole("button", { name: "Unfollow path", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "Follow path", exact: true }),
  ).toBeVisible();
  await other.getByRole("button", { name: "Follow path", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local/path-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Edit path", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Publish this path", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  await expect(
    page.getByText("Private reading path", { exact: false }),
  ).toBeVisible();
  expect((await anon.goto(`/path/${path.id}`))?.status()).toBe(404);
  await other.goto("/browse/paths?view=following");
  await expect(
    other.getByRole("heading", { name: path.title, exact: true }),
  ).toHaveCount(0);
  await anon.goto(`/book/${first.id}`);
  await expect(
    anon.getByRole("heading", { name: path.title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Edit path", exact: true }).click();
  await page.getByRole("button", { name: "Delete path", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  expect(await db.readingPath.count({ where: { id: path.id } })).toBe(1);
  await page.getByRole("button", { name: "Delete path", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page).toHaveURL(/view=mine/);
  expect(await db.readingPath.count({ where: { id: path.id } })).toBe(0);
  expect(await db.readingPathFollow.count({ where: { pathId: path.id } })).toBe(
    0,
  );
  expect(await db.userBook.count({ where: { userId: owner } })).toBe(1);
  await anonymous.close();
  await otherContext.close();
});
test("path validation, creation retries and stale edits protect saved data", async ({
  page,
}) => {
  const userId = await login(page, "conflicts");
  const book = await work("Concurrency");
  const body = {
    id: randomUUID(),
    title: `${prefix} Retry`,
    description: "",
    isPublic: false,
    entries: [{ workId: book.id, note: "Original" }],
  };
  const replies = await Promise.all([
    page.request.post("/api/paths", { data: body }),
    page.request.post("/api/paths", { data: body }),
  ]);
  expect(replies.map((r) => r.status())).toEqual([200, 200]);
  expect(await db.readingPath.count({ where: { userId } })).toBe(1);
  expect(
    (
      await page.request.post("/api/paths", {
        data: { ...body, title: "Changed retry" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/paths", {
        data: { ...body, id: randomUUID(), isPublic: true, entries: [] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/paths", {
        data: {
          ...body,
          id: randomUUID(),
          entries: [body.entries[0], body.entries[0]],
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/paths", {
        data: {
          ...body,
          id: randomUUID(),
          entries: [{ workId: "missing", note: "" }],
        },
      })
    ).status(),
  ).toBe(400);
  await page.goto(`/browse/paths/${body.id}/edit`);
  await page
    .getByRole("textbox", { name: "Path description", exact: true })
    .fill("My unsaved draft");
  expect(
    (
      await page.request.patch(`/api/paths/${body.id}`, {
        data: { ...body, version: 1, description: "Saved in another tab" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save path", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Path description", exact: true }),
  ).toHaveValue("My unsaved draft");
  expect(
    (await db.readingPath.findUniqueOrThrow({ where: { id: body.id } }))
      .description,
  ).toBe("Saved in another tab");
  expect(
    (
      await page.request.delete(`/api/paths/${body.id}`, {
        data: { version: 1 },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Path description", exact: true }),
  ).toHaveValue("My unsaved draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(`/path/${body.id}`);
});
