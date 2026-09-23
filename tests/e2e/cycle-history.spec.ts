import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "cycle-history-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `cycle-history-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `cycle-history-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Cycle ${stamp}` } },
  });
  await db.$disconnect();
});

test("cycle history corrects finish dates without changing sessions and rejects stale or out-of-order edits", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  await add(owner.id, `Cycle ${stamp} Dates`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const logged = await page.request.post("/api/library/session", {
    data: {
      userBookId: book.id,
      requestId: crypto.randomUUID(),
      expectedLastSessionId: null,
      date: "2023-12-20",
      pageStart: 0,
      pageEnd: 50,
      finished: true,
      note: "KEEP_SESSION_NOTE",
    },
  });
  expect(logged.status()).toBe(200);
  const initial = (await logged.json()).book;
  const started = await page.request.post(`/api/library/${book.id}/reread`, {
    data: {
      requestId: crypto.randomUUID(),
      cycleId: initial.cycleId,
      version: initial.cycleVersion,
      date: "2024-02-01",
    },
  });
  expect(started.status()).toBe(200);
  const active = (await started.json()).book;
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          userBookId: book.id,
          requestId: crypto.randomUUID(),
          expectedLastSessionId: active.lastSessionId,
          date: "2024-03-01",
          pageStart: 0,
          pageEnd: 60,
          finished: true,
        },
      })
    ).status(),
  ).toBe(200);
  const cycles = (
    await (await page.request.get(`/api/library/${book.id}/cycles`)).json()
  ).cycles;
  const first = cycles.find((c: { number: number }) => c.number === 1);
  const second = cycles.find((c: { number: number }) => c.number === 2);
  const patch = (date: string, version = first.version) =>
    page.request.patch(`/api/library/${book.id}/cycles`, {
      data: { cycleId: first.id, version, dateFinished: date },
    });
  expect((await patch("2023-12-01")).status()).toBe(400);
  expect((await patch("2024-02-02")).status()).toBe(400);
  await page.goto(`/library?book=${book.id}`);
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("tab", { name: "Sessions", exact: true }).click();
  const history = drawer.getByRole("region", { name: "Reading history" });
  const older = history.getByRole("article", {
    name: "Reading 1",
    exact: true,
  });
  await expect(older).toContainText("1 sessions / 50 pages logged");
  await older
    .getByRole("button", { name: "Correct finish date", exact: true })
    .click();
  await older
    .getByLabel("Corrected finish date", { exact: true })
    .fill("2024-01-05");
  await page.route(`**/api/library/${book.id}/cycles`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        json: { error: "Temporary save failure" },
      });
    else await route.continue();
  });
  await older
    .getByRole("button", { name: "Save finish date", exact: true })
    .click();
  await expect(older.getByRole("alert")).toHaveText("Temporary save failure");
  await expect(
    older.getByLabel("Corrected finish date", { exact: true }),
  ).toHaveValue("2024-01-05");
  await page.unroute(`**/api/library/${book.id}/cycles`);
  await older
    .getByRole("button", { name: "Save finish date", exact: true })
    .click();
  await expect(
    older.getByText("Finished: 2024-01-05", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await db.userBook.findUniqueOrThrow({ where: { id: book.id } })
    ).dateFinished
      ?.toISOString()
      .slice(0, 10),
  ).toBe("2024-03-01");
  await older
    .getByRole("button", { name: "Correct finish date", exact: true })
    .click();
  await older
    .getByLabel("Corrected finish date", { exact: true })
    .fill("2024-01-07");
  expect((await patch("2024-01-06", first.version + 1)).status()).toBe(200);
  await older
    .getByRole("button", { name: "Save finish date", exact: true })
    .click();
  await expect(older.getByRole("alert")).toContainText("changed");
  await expect(
    older.getByLabel("Corrected finish date", { exact: true }),
  ).toHaveValue("2024-01-07");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/cycle-history-mobile.png" });
  await older
    .getByRole("button", { name: "Cancel date correction", exact: true })
    .click();
  await expect(
    older.getByText("Finished: 2024-01-06", { exact: true }),
  ).toBeVisible();
  const current = history.getByRole("article", {
    name: "Reading 2",
    exact: true,
  });
  await current
    .getByRole("button", { name: "Correct finish date", exact: true })
    .click();
  await current
    .getByLabel("Corrected finish date", { exact: true })
    .fill("2024-03-03");
  await current
    .getByRole("button", { name: "Save finish date", exact: true })
    .click();
  await expect(
    current.getByText("Finished: 2024-03-03", { exact: true }),
  ).toBeVisible();
  const after = await db.userBook.findUniqueOrThrow({ where: { id: book.id } });
  expect(after.dateFinished?.toISOString().slice(0, 10)).toBe("2024-03-03");
  expect(after.shelf).toBe("read");
  expect(after.rating).toBe(5);
  expect(after.privateNotes).toBe("PRIVATE_LIBRARY_NOTES");
  expect(
    await db.readingSession.count({
      where: {
        userBookId: book.id,
        note: "KEEP_SESSION_NOTE",
        pageEnd: 50,
        date: new Date("2023-12-20T12:00Z"),
      },
    }),
  ).toBe(1);
  const other = await browser.newPage();
  await login(other, "other");
  expect(
    (await other.request.get(`/api/library/${book.id}/cycles`)).status(),
  ).toBe(404);
  expect(
    (
      await other.request.patch(`/api/library/${book.id}/cycles`, {
        data: {
          cycleId: second.id,
          version: second.version,
          dateFinished: "2024-03-04",
        },
      })
    ).status(),
  ).toBe(404);
  await other.close();
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /2 reads finished/);
  await page.goto("/creator/recap?year=2023");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /0 reads finished/);
  await add(owner.id, `Cycle ${stamp} Undated`);
  const undated = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id, id: { not: book.id } },
  });
  expect(
    (
      await page.request.patch(`/api/library/${undated.id}/cycles`, {
        data: { cycleId: null, version: 0, dateFinished: "2024-05-01" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await db.userBook.findUniqueOrThrow({ where: { id: undated.id } })
    ).dateFinished
      ?.toISOString()
      .slice(0, 10),
  ).toBe("2024-05-01");
});

test("start dates respect reading boundaries and preserve stale drafts", async ({
  page,
}) => {
  const owner = await login(page, "starts");
  await add(owner.id, `Cycle ${stamp} Starts`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const url = `/api/library/${book.id}/cycles`;
  const patch = (
    cycleId: string | null,
    version: number,
    dateStarted: string,
  ) => page.request.patch(url, { data: { cycleId, version, dateStarted } });
  expect((await patch(null, 0, "2099-01-01")).status()).toBe(400);
  expect(await db.readingCycle.count({ where: { userBookId: book.id } })).toBe(
    0,
  );
  expect((await patch(null, 0, "2024-01-01")).status()).toBe(200);
  let first = await db.readingCycle.findFirstOrThrow({
    where: { userBookId: book.id },
  });
  expect(
    (
      await page.request.patch(url, {
        data: {
          cycleId: first.id,
          version: first.version,
          dateFinished: "2024-01-10",
        },
      })
    ).status(),
  ).toBe(200);
  first = await db.readingCycle.findUniqueOrThrow({ where: { id: first.id } });
  const started = await page.request.post(`/api/library/${book.id}/reread`, {
    data: {
      requestId: crypto.randomUUID(),
      cycleId: first.id,
      version: first.version,
      date: "2024-02-01",
    },
  });
  expect(started.status()).toBe(200);
  const active = (await started.json()).book;
  expect(
    (await patch(active.cycleId, active.cycleVersion, "2024-01-09")).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          userBookId: book.id,
          requestId: crypto.randomUUID(),
          expectedLastSessionId: active.lastSessionId,
          date: "2024-02-05",
          pageStart: 0,
          pageEnd: 20,
          finished: false,
        },
      })
    ).status(),
  ).toBe(200);
  const second = await db.readingCycle.findUniqueOrThrow({
    where: { id: active.cycleId },
  });
  expect((await patch(second.id, second.version, "2024-02-06")).status()).toBe(
    400,
  );
  await page.goto(`/library?book=${book.id}`);
  await page
    .getByRole("dialog")
    .getByRole("tab", { name: "Sessions", exact: true })
    .click();
  const current = page.getByRole("article", { name: "Reading 2", exact: true });
  await current
    .getByRole("button", { name: "Correct start date", exact: true })
    .click();
  await current
    .getByLabel("Corrected start date", { exact: true })
    .fill("2024-01-20");
  expect((await patch(second.id, second.version, "2024-01-21")).status()).toBe(
    200,
  );
  await current
    .getByRole("button", { name: "Save start date", exact: true })
    .click();
  await expect(current.getByRole("alert")).toContainText("changed");
  await expect(
    current.getByLabel("Corrected start date", { exact: true }),
  ).toHaveValue("2024-01-20");
  await current
    .getByRole("button", { name: "Cancel date correction", exact: true })
    .click();
  await expect(current).toContainText("Started: 2024-01-21");
  await current
    .getByRole("button", { name: "Correct start date", exact: true })
    .click();
  await current
    .getByLabel("Corrected start date", { exact: true })
    .fill("2024-01-20");
  await current
    .getByRole("button", { name: "Save start date", exact: true })
    .click();
  await expect(current).toContainText("Started: 2024-01-20");
  const archived = await db.readingCycle.findUniqueOrThrow({
    where: { id: first.id },
  });
  expect((await patch(first.id, archived.version, "2024-01-11")).status()).toBe(
    400,
  );
  expect((await patch(first.id, archived.version, "2023-12-30")).status()).toBe(
    200,
  );
  const after = await db.userBook.findUniqueOrThrow({ where: { id: book.id } });
  expect(after.dateStarted?.toISOString().slice(0, 10)).toBe("2024-01-20");
  expect(after.dateFinished).toBeNull();
  expect(after.shelf).toBe("reading_now");
  expect(after.privateNotes).toBe("PRIVATE_LIBRARY_NOTES");
  const session = await db.readingSession.findFirstOrThrow({
    where: { userBookId: book.id },
  });
  expect(session.date.toISOString().slice(0, 10)).toBe("2024-02-05");
  expect(session.pageEnd).toBe(20);
});

test("clearing finish dates confirms totals change, preserves completion and protects stale writes", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "clear");
  await add(owner.id, `Cycle ${stamp} Clear`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const url = `/api/library/${book.id}/cycles`;
  const logged = await page.request.post("/api/library/session", {
    data: {
      userBookId: book.id,
      requestId: crypto.randomUUID(),
      expectedLastSessionId: null,
      date: "2024-01-10",
      pageStart: 0,
      pageEnd: 40,
      finished: true,
      note: "PRESERVE_FINISHED_SESSION",
    },
  });
  expect(logged.status()).toBe(200);
  const first = (await logged.json()).book;
  const clear = (id: string, version: number) =>
    page.request.patch(url, {
      data: { cycleId: id, version, dateFinished: null },
    });
  await db.userBook.update({ where: { id: book.id }, data: { shelf: "tbr" } });
  expect((await clear(first.cycleId, first.cycleVersion)).status()).toBe(409);
  await db.userBook.update({ where: { id: book.id }, data: { shelf: "read" } });
  const foreign = await browser.newPage();
  await login(foreign, "clearforeign");
  expect(
    (
      await foreign.request.patch(url, {
        data: {
          cycleId: first.cycleId,
          version: first.cycleVersion,
          dateFinished: null,
        },
      })
    ).status(),
  ).toBe(404);
  await foreign.close();
  await page.goto(`/library?book=${book.id}`);
  await page
    .getByRole("dialog")
    .getByRole("tab", { name: "Sessions", exact: true })
    .click();
  const reading = page.getByRole("article", { name: "Reading 1", exact: true });
  await reading
    .getByRole("button", { name: "Clear finish date", exact: true })
    .click();
  await expect(reading).toContainText(
    "removes this reading from dated annual totals",
  );
  await reading
    .getByRole("button", { name: "Cancel date correction", exact: true })
    .click();
  await expect(reading).toContainText("Finished: 2024-01-10");
  await reading
    .getByRole("button", { name: "Clear finish date", exact: true })
    .click();
  await page.route(`**/api/library/${book.id}/cycles`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        json: { error: "Temporary save failure" },
      });
    else await route.continue();
  });
  await reading
    .getByRole("button", { name: "Confirm clearing finish date", exact: true })
    .click();
  await expect(reading.getByRole("alert")).toHaveText("Temporary save failure");
  await page.unroute(`**/api/library/${book.id}/cycles`);
  await reading
    .getByRole("button", { name: "Confirm clearing finish date", exact: true })
    .click();
  await expect(reading).toContainText("Finished: Unknown");
  expect((await clear(first.cycleId, first.cycleVersion)).status()).toBe(409);
  const after = await db.userBook.findUniqueOrThrow({ where: { id: book.id } });
  expect(after.dateFinished).toBeNull();
  expect(after.shelf).toBe("read");
  expect(after.rating).toBe(5);
  expect(after.privateNotes).toBe("PRIVATE_LIBRARY_NOTES");
  expect(
    await db.readingSession.count({
      where: {
        userBookId: book.id,
        finished: true,
        pageEnd: 40,
        note: "PRESERVE_FINISHED_SESSION",
      },
    }),
  ).toBe(1);
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /0 reads finished/);
  const cycle = await db.readingCycle.findUniqueOrThrow({
    where: { id: first.cycleId },
  });
  expect(
    (
      await page.request.patch(url, {
        data: {
          cycleId: cycle.id,
          version: cycle.version,
          dateFinished: "2024-01-11",
        },
      })
    ).status(),
  ).toBe(200);
  const restored = await db.readingCycle.findUniqueOrThrow({
    where: { id: cycle.id },
  });
  const reread = await page.request.post(`/api/library/${book.id}/reread`, {
    data: {
      requestId: crypto.randomUUID(),
      cycleId: restored.id,
      version: restored.version,
      date: "2024-02-01",
    },
  });
  expect(reread.status()).toBe(200);
  const archived = await db.readingCycle.findUniqueOrThrow({
    where: { id: cycle.id },
  });
  expect((await clear(archived.id, archived.version)).status()).toBe(200);
  const active = await db.userBook.findUniqueOrThrow({
    where: { id: book.id },
  });
  expect(active.shelf).toBe("reading_now");
  expect(active.dateStarted?.toISOString().slice(0, 10)).toBe("2024-02-01");
});

test("reopening preserves progress, removes the completion and permits finishing the same reading again", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "reopen");
  await add(owner.id, `Cycle ${stamp} Reopen`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const log = (
    requestId: string,
    expectedLastSessionId: string | null,
    date: string,
    pageStart: number,
    pageEnd: number,
    finished: boolean,
  ) =>
    page.request.post("/api/library/session", {
      data: {
        userBookId: book.id,
        requestId,
        expectedLastSessionId,
        date,
        pageStart,
        pageEnd,
        finished,
      },
    });
  const finishId = crypto.randomUUID();
  const finished = await log(finishId, null, "2024-01-10", 0, 40, true);
  expect(finished.status()).toBe(200);
  const initial = (await finished.json()).book;
  const url = `/api/library/${book.id}/reopen`;
  const payload = { cycleId: initial.cycleId, version: initial.cycleVersion };
  const foreign = await browser.newPage();
  await login(foreign, "reopenforeign");
  expect((await foreign.request.post(url, { data: payload })).status()).toBe(
    404,
  );
  await foreign.close();
  expect(
    (
      await page.request.post(url, { data: { ...payload, version: 99 } })
    ).status(),
  ).toBe(409);
  await page.goto(`/library?book=${book.id}`);
  await page
    .getByRole("dialog")
    .getByRole("tab", { name: "Sessions", exact: true })
    .click();
  const reading = page.getByRole("article", { name: "Reading 1", exact: true });
  await reading
    .getByRole("button", { name: "Reopen reading", exact: true })
    .click();
  await expect(reading).toContainText("move the book to Reading now");
  await reading
    .getByRole("button", { name: "Cancel date correction", exact: true })
    .click();
  await expect(reading).toContainText("Finished: 2024-01-10");
  await reading
    .getByRole("button", { name: "Reopen reading", exact: true })
    .click();
  await page.route(`**/api/library/${book.id}/reopen`, (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary reopen failure" } }),
  );
  await reading
    .getByRole("button", { name: "Confirm reopening", exact: true })
    .click();
  await expect(reading.getByRole("alert")).toHaveText(
    "Temporary reopen failure",
  );
  await page.unroute(`**/api/library/${book.id}/reopen`);
  await reading
    .getByRole("button", { name: "Confirm reopening", exact: true })
    .click();
  await expect(reading).toContainText("Finished: Not finished");
  expect((await page.request.post(url, { data: payload })).status()).toBe(409);
  const after = await db.userBook.findUniqueOrThrow({ where: { id: book.id } });
  expect(after.shelf).toBe("reading_now");
  expect(after.dateFinished).toBeNull();
  expect(after.dateStarted?.toISOString().slice(0, 10)).toBe("2024-01-10");
  expect(after.rating).toBe(5);
  expect(after.privateNotes).toBe("PRIVATE_LIBRARY_NOTES");
  expect(await db.readingCycle.count({ where: { userBookId: book.id } })).toBe(
    1,
  );
  const replay = await log(finishId, null, "2024-01-10", 0, 40, true);
  expect(replay.status()).toBe(200);
  const reopened = (await replay.json()).book;
  expect(reopened.shelf).toBe("reading_now");
  expect(reopened.currentPage).toBe(40);
  expect(reopened.canReread).toBe(false);
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /0 reads finished/);
  const complete = await log(
    crypto.randomUUID(),
    reopened.lastSessionId,
    "2024-01-12",
    40,
    60,
    true,
  );
  expect(complete.status()).toBe(200);
  const current = (await complete.json()).book;
  expect(current.cycleId).toBe(initial.cycleId);
  expect(current.shelf).toBe("read");
  expect((await page.request.post(url, { data: payload })).status()).toBe(409);
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /1 reads finished/);
  const reread = await page.request.post(`/api/library/${book.id}/reread`, {
    data: {
      requestId: crypto.randomUUID(),
      cycleId: current.cycleId,
      version: current.cycleVersion,
      date: "2024-02-01",
    },
  });
  expect(reread.status()).toBe(200);
  const archived = await db.readingCycle.findUniqueOrThrow({
    where: { id: initial.cycleId },
  });
  expect(
    (
      await page.request.post(url, {
        data: { cycleId: archived.id, version: archived.version },
      })
    ).status(),
  ).toBe(409);
  await add(owner.id, `Cycle ${stamp} Reopen unknown`);
  const unknown = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id, id: { not: book.id } },
  });
  const un = await page.request.post(`/api/library/${unknown.id}/reopen`, {
    data: { cycleId: null, version: 0 },
  });
  expect(un.status()).toBe(200);
  expect((await un.json()).book.shelf).toBe("reading_now");
});
