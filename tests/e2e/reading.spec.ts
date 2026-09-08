import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { localDate, shiftDay } from "../../lib/reading";
const stamp = Date.now();
const prefix = `Reading E2E ${stamp}`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `folio-reading-${stamp}-${suffix}@example.test`;
  const signup = await page.request.post("/api/auth/signup", {
    data: { name: "Reading test", email, password: "reading-test-password" },
  });
  expect(signup.ok()).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "reading-test-password" },
  });
  return (await db.user.findUniqueOrThrow({ where: { email } })).id;
}
async function makeBook(userId: string, suffix: string, pageCount = 120) {
  return db.userBook.create({
    data: {
      user: { connect: { id: userId } },
      shelf: "reading_now",
      edition: {
        create: {
          format: "paperback",
          pageCount,
          work: {
            create: {
              title: `${prefix} ${suffix}`,
              authorName: "Test Writer",
              genres: [],
              themes: [],
              embedding: [],
            },
          },
        },
      },
    },
    include: { edition: { include: { work: true } } },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `folio-reading-${stamp}-` } },
  });
  await db.work.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.$disconnect();
});
test("reading logs confirm, persist, resist duplicates and update the diary", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const userId = await login(page, "sessions");
  const first = await makeBook(userId, "First");
  await makeBook(userId, "Second");
  await page.goto("/library");
  await page.getByText(first.edition.work.title, { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Log pages", exact: true })
    .click();
  await page.getByLabel("End page", { exact: true }).fill("30");
  await page.getByLabel("Session note (optional)").fill("A quiet half hour.");
  await page.getByText("Session times (optional)").click();
  await page.getByLabel("Start time", { exact: true }).fill("19:00");
  await page.getByLabel("End time", { exact: true }).fill("19:30");
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("30 of 120 pages", { exact: true }),
  ).toBeVisible();
  const saved = await db.readingSession.findFirstOrThrow({
    where: { userBookId: first.id },
  });
  expect(saved.note).toBe("A quiet half hour.");
  expect(saved.timeEnd!.getTime() - saved.timeStart!.getTime()).toBe(1800000);
  const input = {
    userBookId: first.id,
    requestId: randomUUID(),
    expectedLastSessionId: saved.id,
    date: shiftDay(localDate(), -1),
    pageStart: 0,
    pageEnd: 10,
    note: "Yesterday",
    finished: false,
  };
  const log = await page.request.post("/api/library/session", { data: input });
  expect(log.status()).toBe(200);
  expect((await log.json()).book.currentPage).toBe(30);
  const repeat = await page.request.post("/api/library/session", {
    data: input,
  });
  expect((await repeat.json()).duplicate).toBe(true);
  expect(
    await db.readingSession.count({ where: { userBookId: first.id } }),
  ).toBe(2);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: { ...input, finished: true },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          ...input,
          requestId: randomUUID(),
          expectedLastSessionId: null,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: { ...input, requestId: randomUUID(), pageEnd: 121 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: { ...input, requestId: randomUUID(), date: "2026-02-31" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          ...input,
          requestId: randomUUID(),
          timeStart: new Date().toISOString(),
        },
      })
    ).status(),
  ).toBe(400);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "other");
  expect(
    (
      await other.request.post("/api/library/session", {
        data: { ...input, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(404);
  expect(
    (await other.request.get(`/api/library/${first.id}/sessions`)).status(),
  ).toBe(404);
  await otherContext.close();
  await page.goto("/chat");
  await page
    .getByLabel("Message your reading companion")
    .fill("Read another 20 pages");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Which book?", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("combobox", { name: "Which book?", exact: true })
    .selectOption(first.id);
  await expect(page.getByLabel("Start page", { exact: true })).toHaveValue(
    "30",
  );
  await expect(page.getByLabel("End page", { exact: true })).toHaveValue("50");
  expect(
    await db.readingSession.count({ where: { userBookId: first.id } }),
  ).toBe(2);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await db.readingSession.count({ where: { userBookId: first.id } }),
  ).toBe(2);
  await page
    .getByLabel("Message your reading companion")
    .fill("Read another 20 pages");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Which book?", exact: true })
    .selectOption(first.id);
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  await expect(page.getByText(/20 pages logged for/)).toBeVisible();
  const latest = await db.readingSession.findFirstOrThrow({
    where: { userBookId: first.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          userBookId: first.id,
          requestId: randomUUID(),
          expectedLastSessionId: latest.id,
          date: localDate(),
          pageStart: 50,
          pageEnd: 120,
          finished: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/library/diary");
  await expect(
    page.getByRole("heading", {
      name: `Finished: ${first.edition.work.title}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("A quiet half hour.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("130 pages over the last seven days.", { exact: true }),
  ).toBeVisible();
  await page.getByText("Set a reading goal", { exact: true }).click();
  await page
    .getByLabel(`Books in ${new Date().getFullYear()}`, { exact: true })
    .fill("12");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByText("1 of 12 books this year", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("1 of 12 books this year", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/diary-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/diary-mobile.png", fullPage: true });
});

test("custom shelves rename and delete safely; ambiguous imports require a choice", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const userId = await login(page, "review");
  const book = await makeBook(userId, "Ambiguous");
  const second = await db.edition.create({
    data: {
      workId: book.edition.workId,
      format: "hardback",
      publisher: "Second publisher",
      year: 2020,
    },
  });
  const shelf = await db.customShelf.create({
    data: { userId, name: "Old shelf", books: { connect: { id: book.id } } },
  });
  await page.goto("/library");
  await page.getByRole("button", { name: "Old shelf", exact: false }).click();
  await page.getByRole("button", { name: "Manage shelf", exact: true }).click();
  await page.getByLabel("Shelf name", { exact: true }).fill("New shelf");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /^New shelf/, exact: false }),
  ).toBeVisible();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "review-other");
  expect(
    (await other.request.delete(`/api/shelves/${shelf.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await other.request.patch(`/api/shelves/${shelf.id}`, {
        data: { name: "Intruder" },
      })
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Manage shelf", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete shelf...", exact: true })
    .click();
  await expect(page.getByText(/Its books will stay/)).toBeVisible();
  await page.getByRole("button", { name: "Delete shelf", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^New shelf/, exact: false }),
  ).not.toBeVisible();
  expect(await db.userBook.count({ where: { id: book.id } })).toBe(1);
  expect((await page.request.delete("/api/shelves/reading_now")).status()).toBe(
    404,
  );
  const selectedEdition = await page.request.post("/api/library/add", {
    data: {
      editionId: second.id,
      title: book.edition.work.title,
      author: "Test Writer",
      shelf: "tbr",
    },
  });
  expect(selectedEdition.status()).toBe(200);
  expect((await selectedEdition.json()).book.format).toBe("hardback");
  // Remove only this temporary test relationship so the import can add it anew.
  await db.userBook.delete({
    where: { userId_editionId: { userId, editionId: second.id } },
  });
  const csv = `Title,Author,Exclusive Shelf,My Rating\n${book.edition.work.title},Test Writer,read,5`;
  const job = (
    await (
      await page.request.post("/api/import/goodreads", {
        multipart: {
          file: {
            name: "review.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(csv),
          },
        },
      })
    ).json()
  ).job;
  await page.request.post(`/api/import/status/${job.id}`);
  const review = await db.importReview.findFirstOrThrow({
    where: { jobId: job.id },
  });
  expect(
    (
      await other.request.post(`/api/import/reviews/${review.id}`, {
        data: { choice: second.id },
      })
    ).status(),
  ).toBe(404);
  await otherContext.close();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Check your editions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Edition", exact: true })
    .selectOption(second.id);
  await page
    .getByRole("button", { name: "Confirm edition", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your editions", exact: true }),
  ).not.toBeVisible();
  expect(
    (
      await db.userBook.findUniqueOrThrow({
        where: { userId_editionId: { userId, editionId: second.id } },
      })
    ).rating,
  ).toBe(5);
  expect(
    (
      await page.request.post(`/api/import/reviews/${review.id}`, {
        data: { choice: second.id },
      })
    ).status(),
  ).toBe(409);
  // Exercise real combined-search API against the local catalogue; remote search may be unavailable.
  const response = await page.request.get(
    `/api/books/search?q=${encodeURIComponent(book.edition.work.title)}`,
  );
  expect(response.status()).toBe(200);
  expect(
    (await response.json()).results.some(
      (b: { title: string }) => b.title === book.edition.work.title,
    ),
  ).toBe(true);
});
