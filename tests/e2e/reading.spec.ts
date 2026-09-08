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

test("detail drawer saves notes and adds editions without changing reading history", async ({
  page,
  browser,
}) => {
  const userId = await login(page, "drawer");
  const original = await makeBook(userId, "Edition drawer");
  const translation = await db.translation.create({
    data: { workId: original.edition.workId, language: "French" },
  });
  const edition = await db.edition.create({
    data: {
      workId: original.edition.workId,
      translationId: translation.id,
      format: "hardback",
      publisher: "Test Press",
      year: 2020,
      pageCount: 240,
    },
  });
  await db.readingSession.create({
    data: {
      userId,
      userBookId: original.id,
      pageStart: 0,
      pageEnd: 20,
      note: "Original copy note",
    },
  });
  await page.goto("/library");
  await page.getByText(original.edition.work.title, { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(Math.round((await dialog.boundingBox())!.width)).toBe(480);
  await page.getByRole("tab", { name: "Details", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Notes", exact: true }),
  ).toBeFocused();
  await page.route(`**/api/library/${original.id}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary failure" }),
    }),
  );
  await page
    .getByRole("textbox", { name: "Private notes", exact: true })
    .fill("Keep with the original edition");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(
    page.getByText("That didn't save. Try again.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Private notes", exact: true }),
  ).toHaveValue("Keep with the original edition");
  await page.unroute(`**/api/library/${original.id}`);
  await page.getByRole("button", { name: "Save notes", exact: true }).click();

  await page.getByRole("tab", { name: "Sessions", exact: true }).click();
  await expect(
    page.getByText("Original copy note", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await db.userBook.findUniqueOrThrow({ where: { id: original.id } }))
          .privateNotes,
    )
    .toBe("Keep with the original edition");
  await page.getByRole("tab", { name: "Editions", exact: true }).click();
  await expect(
    page.getByText("Test Press / 2020 / French / 240 pages"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add this edition", exact: true })
    .click();
  await expect
    .poll(async () => db.userBook.count({ where: { userId } }))
    .toBe(2);
  const saved = await db.userBook.findUniqueOrThrow({
    where: { id: original.id },
    include: { readingSessions: true },
  });
  expect(saved.editionId).toBe(original.editionId);
  expect(saved.readingSessions).toHaveLength(1);
  expect(saved.privateNotes).toBe("Keep with the original edition");
  const added = await db.userBook.findUniqueOrThrow({
    where: { userId_editionId: { userId, editionId: edition.id } },
  });
  expect(added.shelf).toBe("tbr");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(Math.round((await dialog.boundingBox())!.width)).toBe(390);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, "drawer-other");
  expect(
    (
      await otherPage.request.get(`/api/library/${original.id}/editions`)
    ).status(),
  ).toBe(404);
  await other.close();
});

test("browse connects discovery, public book pages and exact edition addition", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const userId = await login(page, "browse");
  const original = await makeBook(userId, "Public discovery");
  await db.userBook.update({
    where: { id: original.id },
    data: { privateNotes: "SECRET_PRIVATE_READER_NOTE", rating: 4.5 },
  });
  await db.work.update({
    where: { id: original.edition.workId },
    data: {
      description: "A catalogue description for discovery.",
      genres: ["Fiction"],
    },
  });
  const alternate = await db.edition.create({
    data: {
      workId: original.edition.workId,
      format: "hardback",
      publisher: "Discovery Press",
      pageCount: 250,
      year: 2024,
    },
  });
  const anon = await browser.newContext();
  const publicPage = await anon.newPage();
  const response = await publicPage.goto(`/book/${original.edition.workId}`);
  expect(response?.status()).toBe(200);
  await expect(
    publicPage.getByRole("heading", {
      name: original.edition.work.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(publicPage).toHaveTitle(
    `${original.edition.work.title} by Test Writer | Folio`,
  );
  const html = await response!.text();
  expect(html).toContain("A catalogue description for discovery.");
  expect(html).not.toContain("SECRET_PRIVATE_READER_NOTE");
  expect(html).not.toContain(original.id);
  await expect(
    publicPage
      .getByRole("link", { name: "Sign in to add to your library" })
      .first(),
  ).toBeVisible();
  await expect(
    publicPage
      .getByRole("link", { name: "Search libraries on WorldCat" })
      .first(),
  ).toHaveAttribute("href", /https:\/\/search.worldcat.org\/search\?q=/);
  await publicPage.goto("/library");
  await expect(publicPage).toHaveURL(/\/login$/);
  expect(
    (
      await publicPage.request.get(`/api/library/${original.id}/editions`)
    ).status(),
  ).toBe(401);
  expect((await publicPage.goto("/book/not-a-real-work"))?.status()).toBe(404);
  await anon.close();
  await page.goto("/browse");
  await expect(
    page.getByRole("heading", { name: "Continue reading", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log pages", exact: true }).click();
  await page.getByLabel("End page", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Log session", exact: true }).click();
  await expect(
    page.getByText("12 of 120 pages", { exact: true }),
  ).toBeVisible();
  let unavailable = true;
  await page.route("**/api/books/search?*", (route) =>
    unavailable
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "Search fixture unavailable" }),
        })
      : route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            results: [
              {
                workId: original.edition.workId,
                editionId: alternate.id,
                title: original.edition.work.title,
                author: "Test Writer",
                format: "hardback",
              },
            ],
          }),
        }),
  );
  await page
    .getByRole("textbox", { name: "Title, author, or ISBN" })
    .fill("Discovery");
  await page.getByRole("button", { name: "Search books", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Search fixture unavailable" }),
  ).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await page.getByRole("link", { name: "View book", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/book/${original.edition.workId}$`));
  await page
    .getByRole("article")
    .filter({ hasText: "Discovery Press" })
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\?book=/);
  await expect(
    page.getByRole("dialog", { name: original.edition.work.title }),
  ).toBeVisible();
  const added = await db.userBook.findUniqueOrThrow({
    where: { userId_editionId: { userId, editionId: alternate.id } },
  });
  expect(added.shelf).toBe("tbr");
  expect(added.privateNotes).toBeNull();
  expect(await db.userBook.count({ where: { userId } })).toBe(2);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/browse");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/browse-mobile.png", fullPage: true });
});
