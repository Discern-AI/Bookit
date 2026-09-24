import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "bookshelf-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `bookshelf-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `bookshelf-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Shelf ${stamp}` } },
  });
  await db.$disconnect();
});

test("timeline curates Up next and collects existing and new private book activity", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "shelf");
  await add(owner.id, `Shelf ${stamp} Earlier`);
  await add(owner.id, `Shelf ${stamp} Current`);
  await add(owner.id, `Shelf ${stamp} Next`);
  await add(owner.id, `Shelf ${stamp} Unpinned`);
  const rows = await db.userBook.findMany({
    where: { userId: owner.id },
    include: { edition: { include: { work: true } } },
  });
  const earlier = rows.find((b) => b.edition.work.title.endsWith("Earlier"))!;
  const current = rows.find((b) => b.edition.work.title.endsWith("Current"))!;
  const next = rows.find((b) => b.edition.work.title.endsWith("Next"))!;
  const unpinned = rows.find((b) => b.edition.work.title.endsWith("Unpinned"))!;
  await db.userBook.update({
    where: { id: earlier.id },
    data: {
      dateStarted: new Date("2024-01-01"),
      dateFinished: new Date("2024-01-20"),
    },
  });
  await db.userBook.update({
    where: { id: current.id },
    data: { shelf: "reading_now" },
  });
  await db.userBook.updateMany({
    where: { id: { in: [next.id, unpinned.id] } },
    data: { shelf: "tbr" },
  });
  await db.readingSession.create({
    data: {
      userId: owner.id,
      userBookId: earlier.id,
      date: new Date("2024-01-10"),
      pageStart: 0,
      pageEnd: 25,
      note: "SESSION_THOUGHT",
    },
  });
  const articleId = crypto.randomUUID();
  const saved = await page.request.put(`/api/articles/${articleId}`, {
    data: {
      version: 0,
      title: "My related article",
      excerpt: "",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "A thoughtful reading." }],
          },
          {
            type: "bookCard",
            attrs: {
              editionId: earlier.editionId,
              workId: earlier.edition.workId,
              title: earlier.edition.work.title,
              authorName: "A. Reader",
              coverUrl: "",
            },
          },
        ],
      },
    },
  });
  expect(saved.status()).toBe(200);
  await page.goto("/chat");
  const shelf = page.getByRole("region", {
    name: "Your reading bookshelf",
    exact: true,
  });
  await expect(
    shelf.getByRole("button", {
      name: new RegExp("Earlier, finished 2024-01-20"),
    }),
  ).toBeVisible();
  await expect(shelf).toBeInViewport();
  await expect(
    shelf.getByRole("button", { name: new RegExp("Current, reading now") }),
  ).toBeVisible();
  await expect(
    shelf.getByRole("button", { name: new RegExp("Next, up next") }),
  ).toHaveCount(0);
  await shelf
    .getByRole("button", { name: "Choose Up next", exact: true })
    .click();
  await shelf
    .getByRole("checkbox", { name: next.edition.work.title, exact: true })
    .check();
  await expect(
    shelf.getByRole("button", { name: new RegExp("Next, up next") }),
  ).toBeVisible();
  await expect(
    shelf.getByRole("button", { name: new RegExp("Unpinned, up next") }),
  ).toHaveCount(0);
  await shelf
    .getByRole("checkbox", { name: "Show my selected Up next books" })
    .uncheck();
  await expect(
    shelf.getByRole("button", { name: new RegExp("Next, up next") }),
  ).toHaveCount(0);
  await page.reload();
  await shelf
    .getByRole("button", { name: "Choose Up next", exact: true })
    .click();
  await expect(
    shelf.getByRole("checkbox", { name: next.edition.work.title, exact: true }),
  ).toBeChecked();
  await shelf
    .getByRole("checkbox", { name: "Show my selected Up next books" })
    .check();
  await shelf
    .getByRole("button", { name: "Choose Up next", exact: true })
    .click();
  await shelf
    .getByRole("button", { name: new RegExp("Earlier, finished") })
    .click();
  const journal = page.getByRole("dialog", {
    name: "Book journal",
    exact: true,
  });
  await expect(journal).toContainText("PRIVATE_LIBRARY_NOTES");
  await expect(journal).toContainText("PRIVATE_IMPORTED_REVIEW");
  await expect(journal).toContainText("SESSION_THOUGHT");
  await expect(
    journal.getByRole("link", { name: "My related article" }),
  ).toBeVisible();
  await journal
    .getByRole("textbox", { name: "Your note", exact: true })
    .fill("MY_BOOK_THOUGHT");
  await page.route("**/api/journal", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Temporary journal failure" },
    }),
  );
  await journal.getByRole("button", { name: "Save to book journal" }).click();
  await expect(journal.getByRole("alert")).toContainText(
    "Temporary journal failure",
  );
  await expect(
    journal.getByRole("textbox", { name: "Your note", exact: true }),
  ).toHaveValue("MY_BOOK_THOUGHT");
  await page.unroute("**/api/journal");
  await journal.getByRole("button", { name: "Save to book journal" }).click();
  await expect(
    journal.getByRole("article", { name: "note entry" }),
  ).toContainText("MY_BOOK_THOUGHT");
  await journal.getByLabel("Entry type").selectOption("link");
  await journal.getByLabel("Link title or note").fill("My social post");
  await journal
    .getByLabel("Web address")
    .fill("https://example.com/my-reading");
  await journal.getByRole("button", { name: "Save to book journal" }).click();
  await expect(
    journal.getByRole("link", { name: "Open saved post" }),
  ).toHaveAttribute("href", "https://example.com/my-reading");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/book-journal-mobile.png" });
  await journal.getByRole("button", { name: "Close", exact: true }).click();
  await shelf.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/bookshelf-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const url = `/api/library/${earlier.id}/journal`;
  const foreign = await browser.newPage();
  await login(foreign, "foreign");
  expect((await foreign.request.get(url)).status()).toBe(404);
  expect(
    (
      await foreign.request.post("/api/journal", {
        data: {
          id: crypto.randomUUID(),
          workId: earlier.edition.workId,
          kind: "note",
          text: "FOREIGN",
        },
      })
    ).status(),
  ).toBe(404);
  await foreign.close();
  const note = await db.bookEntry.findFirstOrThrow({
    where: { userId: owner.id, kind: "note" },
  });
  expect(
    (
      await page.request.post("/api/journal", {
        data: {
          id: note.id,
          workId: note.workId,
          kind: "note",
          text: note.text,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/journal/${note.id}`, {
        data: { version: note.version, text: "Updated thought" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/journal/${note.id}`, {
        data: { version: note.version, text: "Stale thought" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/journal", {
        data: {
          id: crypto.randomUUID(),
          workId: note.workId,
          kind: "link",
          text: "Bad URL",
          url: "javascript:alert(1)",
        },
      })
    ).status(),
  ).toBe(400);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(
    exported.journalEntries.some(
      (e: { text: string }) => e.text === "Updated thought",
    ),
  ).toBe(true);
  expect(
    (
      await page.request.delete(`/api/journal/${note.id}`, {
        data: { version: note.version + 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/journal", {
        data: {
          id: note.id,
          workId: note.workId,
          kind: "note",
          text: note.text,
        },
      })
    ).status(),
  ).toBe(409);
  const after = await (await page.request.get(url)).json();
  expect(after.entries.some((e: { id: string }) => e.id === note.id)).toBe(
    false,
  );
});

test("chat persists book associations, notes and logged thoughts without a live AI key", async ({
  page,
}) => {
  const owner = await login(page, "chat");
  await add(owner.id, `Shelf ${stamp} Conversation`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
    include: { edition: { include: { work: true } } },
  });
  await db.userBook.update({
    where: { id: book.id },
    data: { shelf: "reading_now" },
  });
  await page.goto(`/chat?book=${book.id}`);
  const input = page.getByRole("textbox", {
    name: "Message your reading companion",
  });
  await expect(page.getByLabel("Book for this conversation")).toHaveValue(
    book.edition.workId,
  );
  await input.fill("The opening scene felt hopeful.");
  await page
    .getByRole("button", { name: "Save as book note", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Note saved");
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({ text: "Tell me what made it feel hopeful." }) +
        "\n" +
        JSON.stringify({ done: true }) +
        "\n",
    }),
  );
  await input.fill("I liked the hopeful opening.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log).toContainText("Tell me what made it feel hopeful.");
  await expect(
    page.getByRole("button", { name: "New chat", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(log).toContainText("I liked the hopeful opening.");
  await expect(log).toContainText("Tell me what made it feel hopeful.");
  await input.fill("Log 10 pages. I loved the ending of this scene.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const proposal = page.getByRole("region", {
    name: "Confirm reading session",
  });
  await expect(proposal).toBeVisible();
  await proposal
    .getByRole("button", { name: /Save|Log/ })
    .first()
    .click();
  await expect(log).toContainText("10 pages logged");
  await page.goto(`/library/book/${book.id}`);
  await expect(
    page.getByRole("region", { name: "Collected notes and chat" }),
  ).toContainText("I loved the ending of this scene.");
  await expect(
    page.getByRole("region", { name: "Collected notes and chat" }),
  ).toContainText("The opening scene felt hopeful.");
  await expect(
    page.getByRole("region", { name: "Reading sessions" }),
  ).toContainText("0-10");
  const before = await db.bookEntry.count({ where: { userId: owner.id } });
  await page.goto("/chat");
  await expect(log).toContainText("10 pages logged");
  await page.getByLabel("Book for message 1").selectOption("");
  const unfiled = await db.bookEntry.findFirstOrThrow({
    where: { userId: owner.id, kind: "chat", role: "user" },
    orderBy: { createdAt: "asc" },
  });
  await expect
    .poll(
      async () =>
        (await db.bookEntry.findUniqueOrThrow({ where: { id: unfiled.id } }))
          .workId,
    )
    .toBeNull();
  expect(await db.bookEntry.count({ where: { userId: owner.id } })).toBe(
    before,
  );
});

test("timeline keeps rereads and unknown dates honest, and journal pagination and account deletion preserve privacy", async ({
  page,
}) => {
  const owner = await login(page, "history");
  await add(owner.id, `Shelf ${stamp} History`);
  const b = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
    include: { edition: true },
  });
  await db.userBook.update({
    where: { id: b.id },
    data: { shelf: "reading_now" },
  });
  await db.readingCycle.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        userBookId: b.id,
        number: 1,
        isCurrent: false,
        dateStarted: new Date("2023-01-01"),
        dateFinished: new Date("2023-01-10"),
      },
      {
        id: crypto.randomUUID(),
        userBookId: b.id,
        number: 2,
        isCurrent: false,
        dateStarted: new Date("2023-02-01"),
        cancelledAt: new Date("2023-02-02"),
      },
      {
        id: crypto.randomUUID(),
        userBookId: b.id,
        number: 3,
        isCurrent: false,
      },
      {
        id: crypto.randomUUID(),
        userBookId: b.id,
        number: 4,
        isCurrent: true,
        dateStarted: new Date("2024-01-01"),
      },
    ],
  });
  const shelf = await (await page.request.get("/api/bookshelf")).json();
  expect(shelf.volumes.map((v: { cycle: number }) => v.cycle)).toEqual([
    3, 1, 4,
  ]);
  expect(shelf.volumes[0].date).toBeNull();
  expect(shelf.volumes[2].section).toBe("current");
  const conversationId = crypto.randomUUID();
  await db.bookEntry.createMany({
    data: Array.from({ length: 105 }, (_, i) => ({
      id: crypto.randomUUID(),
      userId: owner.id,
      workId: b.edition.workId,
      kind: "chat",
      role: i % 2 ? "assistant" : "user",
      conversationId,
      text: `History message ${i}`,
      createdAt: new Date(Date.UTC(2024, 0, 1, 0, 0, i)),
    })),
  });
  const first = await (
    await page.request.get(`/api/library/${b.id}/journal`)
  ).json();
  expect(first.entries).toHaveLength(50);
  expect(first.hasMore).toBe(true);
  const second = await (
    await page.request.get(`/api/library/${b.id}/journal?page=1`)
  ).json();
  expect(second.entries).toHaveLength(50);
  expect(second.entries[0].id).not.toBe(first.entries[0].id);
  const third = await (
    await page.request.get(`/api/library/${b.id}/journal?page=2`)
  ).json();
  expect(third.entries).toHaveLength(5);
  expect(third.hasMore).toBe(false);
  await page.goto(`/chat?conversation=${conversationId}`);
  await expect(page.getByRole("log")).toContainText("History message 104");
  await page.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(page.getByRole("log")).toContainText("History message 0");
  await db.user.delete({ where: { id: owner.id } });
  expect(await db.bookEntry.count({ where: { userId: owner.id } })).toBe(0);
});
