import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "challenges-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `challenges-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `challenges-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `ChallengeBook ${stamp}` } },
  });
  await db.$disconnect();
});

test("personal challenges follow reading history, journals, privacy and deletion", async ({
  page,
  browser,
}) => {
  const user = await login(page, "owner");
  const work = await add(user.id, `ChallengeBook ${stamp} history`);
  await db.work.update({
    where: { id: work.id },
    data: { genres: ["Fantasy"] },
  });
  await add(user.id, `ChallengeBook ${stamp} undated`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: user.id, edition: { workId: work.id } },
  });
  await db.readingCycle.createMany({
    data: [
      {
        userBookId: book.id,
        number: 1,
        isCurrent: false,
        dateFinished: new Date("2026-02-01"),
      },
      {
        userBookId: book.id,
        number: 2,
        isCurrent: true,
        dateFinished: new Date("2026-03-01"),
      },
      {
        userBookId: book.id,
        number: 3,
        isCurrent: false,
        dateFinished: new Date("2026-04-01"),
        cancelledAt: new Date(),
      },
    ],
  });
  await page.goto("/community/challenges");
  await page.getByLabel("Title", { exact: true }).fill("Fantasy year");
  await page.getByLabel("Book target").fill("2");
  await page.getByLabel("Start date").fill("2026-01-01");
  await page.getByLabel("End date").fill("2026-12-31");
  await page.getByLabel("Genre (optional)").fill("fantasy");
  await page.getByRole("button", { name: "Create challenge" }).click();
  await expect(
    page.getByText("2 / 2 completed - Challenge complete!"),
  ).toBeVisible();
  const challenge = await db.readingChallenge.findFirstOrThrow({
    where: { userId: user.id },
  });
  const { id, title, target, startsOn, endsOn, genre } = challenge;
  const payload = { id, title, target, startsOn, endsOn, genre };
  expect(
    (await page.request.post("/api/challenges", { data: payload })).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/challenges", {
        data: { ...payload, endsOn: "2025-01-01" },
      })
    ).status(),
  ).toBe(400);
  let journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.challenges[0].count).toBe(2);
  await page.goto(`/library/book/${book.id}`);
  await expect(
    page
      .getByRole("region", { name: "Your reading challenges" })
      .getByRole("link", { name: "Fantasy year" }),
  ).toBeVisible();
  const other = await browser.newContext();
  const op = await other.newPage();
  await login(op, "other");
  expect(
    (await (await op.request.get("/api/challenges")).json()).challenges,
  ).toEqual([]);
  expect(
    (await op.request.delete("/api/challenges", { data: { id } })).status(),
  ).toBe(404);
  await other.close();
  await db.readingCycle.updateMany({
    where: { userBookId: book.id, isCurrent: true },
    data: { dateFinished: null },
  });
  journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.challenges[0].count).toBe(1);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.challenges[0].completions).toHaveLength(1);
  await page.goto("/community/challenges");
  await page
    .getByRole("button", { name: "Delete challenge", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("1 / 2 completed")).toBeVisible();
  await page
    .getByRole("button", { name: "Delete challenge", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("No challenges yet.")).toBeVisible();
  expect(
    (await page.request.post("/api/challenges", { data: payload })).status(),
  ).toBe(409);
  expect(
    await db.userBook.count({ where: { id: book.id, shelfPinned: false } }),
  ).toBe(1);
  expect(
    (await (await page.request.get(`/api/library/${book.id}/journal`)).json())
      .challenges,
  ).toEqual([]);
});

test("legacy finishes and failed saves retain challenge drafts", async ({
  page,
}) => {
  const user = await login(page, "legacy");
  const work = await add(user.id, `ChallengeBook ${stamp} legacy`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: user.id },
  });
  await db.userBook.update({
    where: { id: book.id },
    data: { dateFinished: new Date("2026-01-01") },
  });
  await page.goto("/community/challenges");
  await page.getByLabel("Title", { exact: true }).fill("Imported reading");
  await page.getByLabel("Start date").fill("2026-01-01");
  await page.getByLabel("End date").fill("2026-12-31");
  await page.route("**/api/challenges", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary save failure" }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Create challenge" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary save failure" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Imported reading",
  );
  await page.unroute("**/api/challenges");
  await page.getByRole("button", { name: "Create challenge" }).click();
  await expect(page.getByText("1 / 12 completed")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await db.userBook.update({
    where: { id: book.id },
    data: { dateFinished: null },
  });
  await page.reload();
  await expect(page.getByText("0 / 12 completed")).toBeVisible();
  await db.user.delete({ where: { id: user.id } });
  expect(await db.readingChallenge.count({ where: { userId: user.id } })).toBe(
    0,
  );
  expect(await db.work.count({ where: { id: work.id } })).toBe(1);
});
