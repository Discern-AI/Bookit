import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "bingo-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `bingo-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `bingo-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `BingoBook ${stamp}` } },
  });
  await db.$disconnect();
});

async function board(page: Page) {
  return (await (await page.request.get("/api/challenges")).json())
    .challenges[0];
}
async function pick(
  page: Page,
  c: any,
  position: number,
  workId: string | null,
  version = c.squares[position].version,
) {
  return page.request.patch("/api/challenges", {
    data: { id: c.id, squareId: c.squares[position].id, workId, version },
  });
}
test("bingo selections survive failures, enforce privacy and link planned books to journals", async ({
  page,
  browser,
}) => {
  const user = await login(page, "board");
  const work = await add(user.id, `BingoBook ${stamp} planned`);
  const otherWork = await add(user.id, `BingoBook ${stamp} alternative`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: user.id, edition: { workId: work.id } },
  });
  await db.userBook.update({ where: { id: book.id }, data: { shelf: "tbr" } });
  await page.goto("/community/challenges");
  await page.getByLabel("Challenge type").selectOption("bingo");
  await page.getByLabel("Title", { exact: true }).fill("My themed year");
  await page
    .getByLabel("Prompt 1", { exact: true })
    .fill("A book about the sea");
  await page.getByLabel("Start date").fill("2026-01-01");
  await page.getByLabel("End date").fill("2026-12-31");
  await page.getByRole("button", { name: "Create challenge" }).click();
  await expect(page.getByText("0 / 9 completed")).toBeVisible();
  let c = await board(page);
  expect(c.squares).toHaveLength(9);
  const payload = {
    id: c.id,
    title: c.title,
    kind: "bingo",
    target: 9,
    startsOn: c.startsOn,
    endsOn: c.endsOn,
    genre: null,
    prompts: c.squares.map((s: any) => s.prompt),
  };
  expect(
    (await page.request.post("/api/challenges", { data: payload })).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/challenges", {
        data: { ...payload, prompts: ["Only one"] },
      })
    ).status(),
  ).toBe(400);
  await page
    .getByRole("button", { name: "Choose book for square 1", exact: true })
    .click();
  await page
    .getByLabel("Book for square", { exact: true })
    .selectOption(work.id);
  await page.route("**/api/challenges", async (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary selection failure" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save selection" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary selection failure" }),
  ).toBeVisible();
  await expect(page.getByLabel("Book for square", { exact: true })).toHaveValue(
    work.id,
  );
  await page.unroute("**/api/challenges");
  await page.getByRole("button", { name: "Save selection" }).click();
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  expect((await pick(page, c, 0, work.id)).status()).toBe(200);
  expect((await pick(page, c, 1, work.id)).status()).toBe(409);
  let journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.challenges[0].count).toBe(0);
  await page.goto(`/library/book/${book.id}`);
  await expect(
    page
      .getByRole("region", { name: "Your reading challenges" })
      .getByRole("link", { name: "My themed year" }),
  ).toBeVisible();
  await page.goto("/community/challenges");
  await page
    .getByRole("button", { name: "Choose book for square 1", exact: true })
    .click();
  await page
    .getByLabel("Book for square", { exact: true })
    .selectOption(otherWork.id);
  c = await board(page);
  expect((await pick(page, c, 0, null)).status()).toBe(200);
  await page.getByRole("button", { name: "Save selection" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await expect(page.getByLabel("Book for square", { exact: true })).toHaveValue(
    otherWork.id,
  );
  await page
    .getByRole("button", { name: "Discard selection and reload" })
    .click();
  const context = await browser.newContext();
  const op = await context.newPage();
  const stranger = await login(op, "stranger");
  const foreign = await add(stranger.id, `BingoBook ${stamp} foreign`);
  expect((await pick(op, c, 0, foreign.id)).status()).toBe(404);
  c = await board(page);
  expect((await pick(page, c, 0, foreign.id)).status()).toBe(404);
  expect(
    (await (await op.request.get("/api/challenges")).json()).challenges,
  ).toEqual([]);
  await context.close();
  expect((await pick(page, c, 0, work.id)).status()).toBe(200);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.challenges[0].squares[0].workId).toBe(work.id);
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "My themed year" })
    .scrollIntoViewIfNeeded();
  await page.locator('[aria-label="Bingo board"]').screenshot({ path: "test-results/bingo-mobile.png" });
  await page
    .getByRole("button", { name: "Delete challenge", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("No challenges yet.")).toBeVisible();
  expect((await pick(page, c, 0, work.id)).status()).toBe(404);
  expect(
    (await page.request.post("/api/challenges", { data: payload })).status(),
  ).toBe(409);
  journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.challenges).toEqual([]);
  expect(
    await db.userBook.count({
      where: { id: book.id, shelf: "tbr", shelfPinned: false },
    }),
  ).toBe(1);
});
test("bingo lines follow dated cycles across editions and account deletion removes squares", async ({
  page,
}) => {
  const user = await login(page, "lines");
  await page.request.post("/api/challenges", {
    data: {
      id: crypto.randomUUID(),
      kind: "bingo",
      title: "Three in a row",
      target: 9,
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      genre: null,
      prompts: Array.from({ length: 9 }, (_, i) => `Theme ${i + 1}`),
    },
  });
  const c = await board(page);
  const books = [];
  for (let i = 0; i < 3; i++) {
    const w = await add(user.id, `BingoBook ${stamp} row ${i}`);
    const b = await db.userBook.findFirstOrThrow({
      where: { userId: user.id, edition: { workId: w.id } },
    });
    books.push(b);
    await db.readingCycle.createMany({
      data: [
        {
          userBookId: b.id,
          number: 1,
          isCurrent: false,
          dateFinished: new Date(i === 0 ? "2026-01-01" : "2026-12-31"),
        },
        {
          userBookId: b.id,
          number: 2,
          isCurrent: true,
          dateFinished: new Date("2026-06-01"),
        },
      ],
    });
    expect((await pick(page, c, i, w.id)).status()).toBe(200);
  }
  let current = await board(page);
  expect(current.completions).toHaveLength(3);
  expect(current.lines).toBe(1);
  await page.goto("/community/challenges");
  await expect(page.getByText("1 bingo line completed")).toBeVisible();
  await db.readingCycle.updateMany({
    where: { userBookId: books[0].id },
    data: { cancelledAt: new Date() },
  });
  current = await board(page);
  expect(current.completions).toHaveLength(2);
  expect(current.lines).toBe(0);
  const edition = await db.edition.findUniqueOrThrow({
    where: { id: books[0].editionId },
  });
  const second = await db.edition.create({
    data: {
      workId: edition.workId,
      format: "ebook",
      userBooks: {
        create: {
          userId: user.id,
          shelf: "read",
          dateFinished: new Date("2026-07-01"),
        },
      },
    },
    include: { userBooks: true },
  });
  current = await board(page);
  expect(current.lines).toBe(1);
  expect(current.squares[0].completion.userBookId).toBe(second.userBooks[0].id);
  await db.userBook.update({
    where: { id: second.userBooks[0].id },
    data: { dateFinished: new Date("2025-12-31") },
  });
  expect((await board(page)).lines).toBe(0);
  await db.user.delete({ where: { id: user.id } });
  expect(await db.challengeSquare.count({ where: { challengeId: c.id } })).toBe(
    0,
  );
  expect(await db.work.count({ where: { id: edition.workId } })).toBe(1);
});
