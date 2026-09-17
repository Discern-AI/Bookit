import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "session-edit-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `session-edit-${stamp}-${suffix}@example.test`;
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
      username: `sc${stamp}${suffix}`,
      publicName: "Public reader",
      profilePublic: true,
    },
  });
}
async function add(userId: string, title: string) {
  return db.work.create({
    data: {
      title,
      authorName: "A. Reader",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "paperback",
          userBooks: {
            create: {
              userId,
              shelf: "read",
              rating: 5,
              privateNotes: "PRIVATE_LIBRARY_NOTES",
              importedReview: "PRIVATE_IMPORTED_REVIEW",
            },
          },
        },
      },
    },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `session-edit-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Session ${stamp}` } },
  });
  await db.$disconnect();
});

test("session corrections and deletion update totals, reject stale changes and preserve book details", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  await add(owner.id, `Session ${stamp} Reading history`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await db.edition.update({
    where: { id: book.editionId },
    data: { pageCount: 200 },
  });
  const original = {
    userBookId: book.id,
    requestId: crypto.randomUUID(),
    expectedLastSessionId: null,
    date: "2024-01-01",
    pageStart: 0,
    pageEnd: 30,
    note: "PRIVATE_ORIGINAL",
    finished: true,
  };
  const created = await page.request.post("/api/library/session", {
    data: original,
  });
  expect(created.ok()).toBe(true);
  const saved = await db.readingSession.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const before = await db.userBook.findUniqueOrThrow({
    where: { id: book.id },
  });
  await page.goto("/library/diary");
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit reading session" });
  await edit
    .getByRole("spinbutton", { name: "End page", exact: true })
    .fill("45");
  await edit.getByLabel("Reading date", { exact: true }).fill("2024-02-02");
  await edit
    .getByRole("textbox", { name: "Private session note", exact: true })
    .fill("PRIVATE_CORRECTED");
  await edit
    .getByRole("button", { name: "Save session changes", exact: true })
    .click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByText("PRIVATE_CORRECTED", { exact: true }),
  ).toBeVisible();
  const changed = await db.readingSession.findUniqueOrThrow({
    where: { id: saved.id },
  });
  expect(changed.version).toBe(1);
  expect(changed.pageEnd).toBe(45);
  const patch = {
    version: 0,
    date: "2024-02-02",
    pageStart: 0,
    pageEnd: 50,
    note: "stale",
  };
  expect(
    (
      await page.request.patch(`/api/library/sessions/${saved.id}`, {
        data: patch,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch(`/api/library/sessions/${saved.id}`, {
        data: { ...patch, version: 1, pageEnd: 201 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          ...original,
          requestId: crypto.randomUUID(),
          expectedLastSessionId: saved.id,
          pageStart: 30,
          pageEnd: 40,
          finished: false,
        },
      })
    ).status(),
  ).toBe(409);
  const other = await browser.newPage();
  await login(other, "other");
  expect(
    (
      await other.request.delete(`/api/library/sessions/${saved.id}`, {
        data: { version: 1 },
      })
    ).status(),
  ).toBe(404);
  await other.close();
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /45 pages logged \/ 1 reading days/);
  await page.goto("/library/diary");
  await page
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  const remove = page.getByRole("dialog", { name: "Delete reading session" });
  await remove.getByRole("button", { name: "Close", exact: true }).click();
  expect(
    (await db.readingSession.findUniqueOrThrow({ where: { id: saved.id } }))
      .deletedAt,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/session-deletion-mobile.png" });
  await remove
    .getByRole("button", { name: "Confirm session deletion", exact: true })
    .click();
  await expect(remove).not.toBeVisible();
  await expect(
    page.getByText("PRIVATE_CORRECTED", { exact: true }),
  ).toHaveCount(0);
  const deleted = await db.readingSession.findUniqueOrThrow({
    where: { id: saved.id },
  });
  expect(deleted.deletedAt).not.toBeNull();
  expect(deleted.note).toBeNull();
  expect(deleted.pageEnd).toBe(0);
  expect(
    (
      await page.request.post("/api/library/session", { data: original })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.delete(`/api/library/sessions/${saved.id}`, {
        data: { version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/library/sessions/${saved.id}`, {
        data: { ...patch, version: 2 },
      })
    ).status(),
  ).toBe(409);
  const history = await (
    await page.request.get(`/api/library/${book.id}/sessions`)
  ).json();
  expect(history.sessions).toHaveLength(0);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.books[0].readingSessions).toHaveLength(0);
  const after = await db.userBook.findUniqueOrThrow({ where: { id: book.id } });
  expect(after.shelf).toBe(before.shelf);
  expect(after.dateFinished).toEqual(before.dateFinished);
  expect(after.privateNotes).toBe(before.privateNotes);
  expect(after.rating).toBe(before.rating);
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /0 pages logged \/ 0 reading days/);
});
