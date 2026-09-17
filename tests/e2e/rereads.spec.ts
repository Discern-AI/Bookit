import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "reread-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `reread-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `reread-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Reread ${stamp}` } },
  });
  await db.$disconnect();
});

test("rereads preserve earlier finishes, isolate progress and resist duplicate or stale starts", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  await add(owner.id, `Reread ${stamp} Again`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const first = await page.request.post("/api/library/session", {
    data: {
      userBookId: book.id,
      requestId: crypto.randomUUID(),
      expectedLastSessionId: null,
      date: "2024-01-01",
      pageStart: 0,
      pageEnd: 50,
      finished: true,
      note: "FIRST_READ_NOTE",
    },
  });
  expect(first.status()).toBe(200);
  const initial = (await first.json()).book;
  const firstSession = await db.readingSession.findFirstOrThrow({
    where: { userBookId: book.id },
  });
  await page.goto(`/library?book=${book.id}`);
  const drawer = page.getByRole("dialog");
  await drawer
    .getByRole("button", { name: "Start reread", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Cancel reread", exact: true })
    .click();
  expect(await db.readingCycle.count({ where: { userBookId: book.id } })).toBe(
    1,
  );
  await drawer
    .getByRole("button", { name: "Start reread", exact: true })
    .click();
  await drawer
    .getByLabel("Reread start date", { exact: true })
    .fill("2024-02-02");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/start-reread-mobile.png" });
  await drawer
    .getByRole("button", { name: "Confirm reread", exact: true })
    .click();
  await expect(drawer.getByText("Reading 2", { exact: true })).toBeVisible();
  const secondCycle = await db.readingCycle.findFirstOrThrow({
    where: { userBookId: book.id, isCurrent: true },
  });
  const retry = {
    requestId: secondCycle.requestId,
    cycleId: initial.cycleId,
    version: initial.cycleVersion,
    date: "2024-02-02",
  };
  const duplicates = await Promise.all([
    page.request.post(`/api/library/${book.id}/reread`, { data: retry }),
    page.request.post(`/api/library/${book.id}/reread`, { data: retry }),
  ]);
  expect(duplicates.map((r) => r.status())).toEqual([200, 200]);
  const active = (await duplicates[0].json()).book;
  expect(active.currentPage).toBe(0);
  expect(active.shelf).toBe("reading_now");
  expect(active.rating).toBe(5);
  expect(
    (
      await page.request.post(`/api/library/${book.id}/reread`, {
        data: { ...retry, requestId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(`/api/library/${book.id}/reread`, {
        data: { ...retry, date: "2024-02-03" },
      })
    ).status(),
  ).toBe(409);
  const other = await browser.newPage();
  await login(other, "other");
  expect(
    (
      await other.request.post(`/api/library/${book.id}/reread`, {
        data: retry,
      })
    ).status(),
  ).toBe(404);
  await other.close();
  const log = {
    userBookId: book.id,
    requestId: crypto.randomUUID(),
    expectedLastSessionId: active.lastSessionId,
    date: "2024-02-03",
    pageStart: 0,
    pageEnd: 30,
    finished: true,
  };
  expect(
    (
      await page.request.post("/api/library/session", {
        data: { ...log, expectedLastSessionId: initial.lastSessionId },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: { ...log, date: "2024-02-01" },
      })
    ).status(),
  ).toBe(400);
  const finished = await page.request.post("/api/library/session", {
    data: log,
  });
  expect(finished.status()).toBe(200);
  expect((await finished.json()).book.currentPage).toBe(30);
  expect(
    (
      await page.request.patch(`/api/library/${book.id}`, {
        data: { shelf: "reading_now" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch(`/api/library/${book.id}`, {
        data: { shelf: "tbr" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(`/api/library/${book.id}`, {
        data: { shelf: "read" },
      })
    ).status(),
  ).toBe(200);
  const cycles = await db.readingCycle.findMany({
    where: { userBookId: book.id },
    orderBy: { number: "asc" },
  });
  expect(cycles).toHaveLength(2);
  expect(cycles[0].dateFinished?.toISOString().slice(0, 10)).toBe("2024-01-01");
  expect(cycles[1].dateFinished?.toISOString().slice(0, 10)).toBe("2024-02-03");
  expect(
    (
      await page.request.patch(`/api/library/sessions/${firstSession.id}`, {
        data: {
          version: 0,
          date: "2024-01-01",
          pageStart: 0,
          pageEnd: 40,
          note: "CORRECTED_FIRST_READ",
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/library/diary");
  await expect(
    page.getByRole("heading", {
      name: `Finished: Reread ${stamp} Again`,
      exact: true,
    }),
  ).toHaveCount(2);
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /2 reads finished \/ 70 pages logged/);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.books[0].readingCycles).toHaveLength(2);
  expect(
    new Set(
      exported.books[0].readingSessions.map(
        (s: { cycleId: string }) => s.cycleId,
      ),
    ).size,
  ).toBe(2);
  expect(exported.books[0].privateNotes).toBe("PRIVATE_LIBRARY_NOTES");
  await add(owner.id, `Reread ${stamp} Undated`);
  const undated = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id, id: { not: book.id } },
  });
  const started = await page.request.post(`/api/library/${undated.id}/reread`, {
    data: {
      requestId: crypto.randomUUID(),
      cycleId: null,
      version: 0,
      date: "2024-04-01",
    },
  });
  expect(started.status()).toBe(200);
  const legacy = await db.readingCycle.findFirstOrThrow({
    where: { userBookId: undated.id, number: 1 },
  });
  expect(legacy.dateFinished).toBeNull();
  await add(owner.id, `Reread ${stamp} Imported dated`);
  const dated = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id, id: { notIn: [book.id, undated.id] } },
  });
  await db.userBook.update({
    where: { id: dated.id },
    data: { dateFinished: new Date("2024-03-01T12:00:00Z") },
  });
  const datedInput = {
    requestId: crypto.randomUUID(),
    cycleId: null,
    version: 0,
    date: "2024-02-01",
  };
  expect(
    (
      await page.request.post(`/api/library/${dated.id}/reread`, {
        data: datedInput,
      })
    ).status(),
  ).toBe(400);
  expect(await db.readingCycle.count({ where: { userBookId: dated.id } })).toBe(
    0,
  );
  expect(
    (
      await page.request.post(`/api/library/${dated.id}/reread`, {
        data: { ...datedInput, date: "2024-04-01" },
      })
    ).status(),
  ).toBe(200);
});
