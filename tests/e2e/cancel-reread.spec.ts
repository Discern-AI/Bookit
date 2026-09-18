import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "cancel-reread-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `cancel-reread-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `cancel-reread-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Cancel ${stamp}` } },
  });
  await db.$disconnect();
});

test("empty reread cancellation restores history and cannot erase logged reading or revive old requests", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  await add(owner.id, `Cancel ${stamp} Again`);
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
      note: "KEEP_READING",
    },
  });
  expect(first.status()).toBe(200);
  const previous = (await first.json()).book;
  const start = {
    requestId: crypto.randomUUID(),
    cycleId: previous.cycleId,
    version: previous.cycleVersion,
    date: "2024-02-01",
  };
  const started = await page.request.post(`/api/library/${book.id}/reread`, {
    data: start,
  });
  expect(started.status()).toBe(200);
  const active = (await started.json()).book;
  const cancel = { cycleId: active.cycleId, version: active.cycleVersion };
  expect(
    (
      await page.request.delete(`/api/library/${book.id}/reread`, {
        data: { ...cancel, version: 99 },
      })
    ).status(),
  ).toBe(409);
  const other = await browser.newPage();
  await login(other, "other");
  expect(
    (
      await other.request.delete(`/api/library/${book.id}/reread`, {
        data: cancel,
      })
    ).status(),
  ).toBe(404);
  await other.close();
  await page.goto(`/library?book=${book.id}`);
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("tab", { name: "Sessions", exact: true }).click();
  const current = drawer.getByRole("article", {
    name: "Reading 2",
    exact: true,
  });
  await current
    .getByRole("button", { name: "Cancel this reread", exact: true })
    .click();
  await current
    .getByRole("button", { name: "Keep this reread", exact: true })
    .click();
  expect(
    (await db.readingCycle.findUniqueOrThrow({ where: { id: active.cycleId } }))
      .cancelledAt,
  ).toBeNull();
  await current
    .getByRole("button", { name: "Cancel this reread", exact: true })
    .click();
  await page.route(`**/api/library/${book.id}/reread`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Temporary cancellation failure" },
    }),
  );
  await current
    .getByRole("button", { name: "Confirm reread cancellation", exact: true })
    .click();
  await expect(current.getByRole("alert")).toHaveText(
    "Temporary cancellation failure",
  );
  await page.unroute(`**/api/library/${book.id}/reread`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/cancel-reread-mobile.png" });
  await current
    .getByRole("button", { name: "Confirm reread cancellation", exact: true })
    .click();
  await expect(current).toHaveCount(0);
  await expect(
    drawer.getByText("Reading 1 / Current", { exact: true }),
  ).toBeVisible();
  const repeated = await page.request.delete(`/api/library/${book.id}/reread`, {
    data: cancel,
  });
  expect(repeated.status()).toBe(200);
  const restored = (await repeated.json()).book;
  expect(restored.currentPage).toBe(50);
  expect(restored.shelf).toBe("read");
  expect(restored.dateFinished.slice(0, 10)).toBe("2024-01-01");
  expect(restored.rating).toBe(5);
  expect(restored.privateNotes).toBe("PRIVATE_LIBRARY_NOTES");
  expect(
    (
      await page.request.post(`/api/library/${book.id}/reread`, { data: start })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/library/session", {
        data: {
          userBookId: book.id,
          requestId: crypto.randomUUID(),
          expectedLastSessionId: active.lastSessionId,
          date: "2024-02-02",
          pageStart: 0,
          pageEnd: 10,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    await db.readingSession.count({
      where: { userBookId: book.id, note: "KEEP_READING" },
    }),
  ).toBe(1);
  const fresh = await page.request.post(`/api/library/${book.id}/reread`, {
    data: {
      requestId: crypto.randomUUID(),
      cycleId: restored.cycleId,
      version: restored.cycleVersion,
      date: "2024-04-01",
    },
  });
  expect(fresh.status()).toBe(200);
  const next = (await fresh.json()).book;
  expect(next.cycleNumber).toBe(3);
  expect((await page.request.delete(`/api/library/${book.id}/reread`,{data:cancel})).status()).toBe(200);
  expect((await db.readingCycle.findUniqueOrThrow({where:{id:next.cycleId}})).isCurrent).toBe(true);
  const history = (
    await (await page.request.get(`/api/library/${book.id}/cycles`)).json()
  ).cycles;
  const earlier = history.find((c: { number: number }) => c.number === 1);
  expect(
    (
      await page.request.patch(`/api/library/${book.id}/cycles`, {
        data: {
          cycleId: earlier.id,
          version: earlier.version,
          dateFinished: "2024-03-01",
        },
      })
    ).status(),
  ).toBe(200);
  const log = await page.request.post("/api/library/session", {
    data: {
      userBookId: book.id,
      requestId: crypto.randomUUID(),
      expectedLastSessionId: next.lastSessionId,
      date: "2024-04-02",
      pageStart: 0,
      pageEnd: 10,
    },
  });
  expect(log.status()).toBe(200);
  const nextCancel = { cycleId: next.cycleId, version: next.cycleVersion };
  expect(
    (
      await page.request.delete(`/api/library/${book.id}/reread`, {
        data: nextCancel,
      })
    ).status(),
  ).toBe(409);
  const saved = await db.readingSession.findFirstOrThrow({
    where: { cycleId: next.cycleId },
  });
  expect(
    (
      await page.request.delete(`/api/library/sessions/${saved.id}`, {
        data: { version: saved.version },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.delete(`/api/library/${book.id}/reread`, {
        data: nextCancel,
      })
    ).status(),
  ).toBe(409);
  const finished = await page.request.post("/api/library/session", {
    data: {
      userBookId: book.id,
      requestId: crypto.randomUUID(),
      expectedLastSessionId: next.lastSessionId,
      date: "2024-04-03",
      pageStart: 0,
      pageEnd: 20,
      finished: true,
    },
  });
  expect(finished.status()).toBe(200);
  const completed = (await finished.json()).book;
  expect(
    (
      await page.request.delete(`/api/library/${book.id}/reread`, {
        data: { cycleId: completed.cycleId, version: completed.cycleVersion },
      })
    ).status(),
  ).toBe(409);
  await page.goto("/creator/recap?year=2024");
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", /2 reads finished/);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(
    exported.books[0].readingCycles.filter(
      (c: { cancelledAt: string | null }) => c.cancelledAt,
    ),
  ).toHaveLength(1);
});
