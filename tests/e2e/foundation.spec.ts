import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const email = `folio-e2e-${stamp}@example.test`;
const prefix = `E2E ${stamp}`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `folio-e2e-${stamp}` } },
  });
  await db.work.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.$disconnect();
});
test("signup, resumable import, shelves, private edits, add, chat and isolation", async ({
  page,
  browser,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Folio test reader");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-reader-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(
    page.getByRole("heading", { name: "What are you reading?" }),
  ).toBeVisible();
  await page.goto("/settings");
  const csv = `Title,Author,Exclusive Shelf,My Rating,Date Read,Date Added,Bookshelves,My Review\n"${prefix} First book",Test Writer,read,4,2026/09/01,2026/08/01,"read, favourites","A review, with a comma"\n"${prefix} Second book",Test Writer,currently-reading,0,,2026/09/01,currently-reading,\n"${prefix} First book",Test Writer,read,4,,,,\n`;
  await page.getByLabel("Goodreads CSV").setInputFiles({
    name: "goodreads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Import from Goodreads" }).click();
  await expect(
    page.getByText("Import complete", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("2 added \u00b7 1 already in your library"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Import complete", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open your library" }).click();
  await page.getByRole("button", { name: "All books", exact: false }).click();
  await expect(
    page.getByText(`${prefix} First book`, { exact: true }),
  ).toBeVisible();
  await page.getByText(`${prefix} First book`, { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Rate 4.5 stars", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Rating: 4.5 out of 5" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("A private thought that should persist.");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db.userBook.findFirst({
            where: {
              user: { email },
              edition: { work: { title: `${prefix} First book` } },
            },
          })
        )?.privateNotes,
    )
    .toBe("A private thought that should persist.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "+ New shelf", exact: true }).click();
  await page.getByLabel("Shelf name").fill("Weekend reading");
  await page.getByRole("button", { name: "Create shelf", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Weekend reading" }),
  ).toBeVisible();
  await page.route("**/api/books/search?*", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            title: `${prefix} Third book`,
            author: "Another Writer",
            year: 2020,
            pageCount: 240,
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "+ Add book", exact: true }).click();
  await page
    .getByLabel("Title, author, or ISBN", { exact: true })
    .fill("Third");
  await page
    .getByRole("button", {
      name: `${prefix} Third book Another Writer`,
      exact: false,
    })
    .click();
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: `${prefix} Third book` }),
  ).toBeVisible();
  await page.getByLabel("Weekend reading", { exact: true }).check();
  await expect(
    page.getByLabel("Weekend reading", { exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByText(`${prefix} Third book`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All books", exact: false }).click();
  await page.screenshot({ path: ".local/library-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local/library-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByLabel("Search your shelf")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  const records = await db.userBook.findMany({
    where: { user: { email } },
    include: { edition: { include: { work: true } } },
  });
  expect(records).toHaveLength(3);
  const first = records.find((b) =>
    b.edition.work.title.endsWith("First book"),
  )!;
  expect(first.importedReview).toBe("A review, with a comma");
  expect(first.rating).toBe(4.5);
  const other = await browser.newContext();
  const anonymous = await other.request.patch(`/api/library/${first.id}`, {
    data: { rating: 1 },
  });
  expect(anonymous.status()).toBe(401);
  await other.request.post("/api/auth/signup", {
    data: {
      name: "Other reader",
      email: `folio-e2e-${stamp}-other@example.test`,
      password: "test-reader-password-123",
    },
  });
  const csrf = await (await other.request.get("/api/auth/csrf")).json();
  await other.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email: `folio-e2e-${stamp}-other@example.test`,
      password: "test-reader-password-123",
    },
  });
  expect(
    (
      await other.request.patch(`/api/library/${first.id}`, {
        data: { rating: 1 },
      })
    ).status(),
  ).toBe(404);
  const jobs = await db.importJob.findMany({ where: { user: { email } } });
  expect(
    (await other.request.get(`/api/import/status/${jobs[0].id}`)).status(),
  ).toBe(404);
  await other.close();
  await page.goto("/chat");
  await page
    .getByLabel("Message your reading companion")
    .fill("What should I read?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "reading companion" }),
  ).toContainText("isn't connected yet");
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          text: "Your library has **three books** worth revisiting.",
        }) +
        "\n" +
        JSON.stringify({ done: true }) +
        "\n",
    }),
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("three books", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/chat-desktop.png", fullPage: true });
});

test("500-book import resumes after interruption and reimport does not duplicate records", async ({
  page,
}) => {
  test.setTimeout(120000);
  const bulkEmail = `folio-e2e-${stamp}-bulk@example.test`;
  await page.request.post("/api/auth/signup", {
    data: {
      name: "Import reader",
      email: bulkEmail,
      password: "test-reader-password-123",
    },
  });
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email: bulkEmail,
      password: "test-reader-password-123",
    },
  });
  const csv =
    "Title,Author,Exclusive Shelf,Bookshelves\n" +
    Array.from(
      { length: 500 },
      (_, i) => `${prefix} Bulk ${i},Import Writer,to-read,weekend`,
    ).join("\n");
  const upload = async () =>
    (
      await (
        await page.request.post("/api/import/goodreads", {
          multipart: {
            file: {
              name: "bulk.csv",
              mimeType: "text/csv",
              buffer: Buffer.from(csv),
            },
          },
        })
      ).json()
    ).job;
  const job = await upload();
  const batch = await (
    await page.request.post(`/api/import/status/${job.id}`)
  ).json();
  expect(batch.job.processed).toBe(25);
  const started = Date.now();
  await page.goto("/chat");
  await expect
    .poll(
      async () =>
        (await db.importJob.findUnique({ where: { id: job.id } }))?.status,
      { timeout: 90000 },
    )
    .toBe("complete");
  expect(Date.now() - started).toBeLessThan(120000);
  expect(
    await db.userBook.count({ where: { user: { email: bulkEmail } } }),
  ).toBe(500);
  const repeat = await upload();
  await page.reload();
  await expect
    .poll(
      async () =>
        (await db.importJob.findUnique({ where: { id: repeat.id } }))?.status,
      { timeout: 90000 },
    )
    .toBe("complete");
  const completed = await db.importJob.findUnique({ where: { id: repeat.id } });
  expect(completed?.skipped).toBe(500);
  expect(
    await db.userBook.count({ where: { user: { email: bulkEmail } } }),
  ).toBe(500);
});
