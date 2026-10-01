import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "community-challenges-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `community-challenges-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `community-challenges-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `SharedChallengeBook ${stamp}` } },
  });
  await db.$disconnect();
});

async function create(page: Page, kind = "bingo") {
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/challenges", {
        data: {
          id,
          kind,
          title: `Shared board ${stamp}`,
          target: kind === "bingo" ? 9 : 12,
          startsOn: "2026-01-01",
          endsOn: "2026-12-31",
          genre: null,
          ...(kind === "bingo"
            ? {
                prompts: Array.from(
                  { length: 9 },
                  (_, i) => `Public prompt ${i + 1}`,
                ),
              }
            : {}),
        },
      })
    ).status(),
  ).toBe(201);
  return id;
}
async function share(
  page: Page,
  id: string,
  isPublic: boolean,
  version: number,
) {
  return page.request.patch("/api/challenges/community", {
    data: { id, isPublic, version },
  });
}
async function join(
  page: Page,
  sourceId: string,
  version: number,
  id = crypto.randomUUID(),
) {
  return page.request.post("/api/challenges/community", {
    data: { id, sourceId, version },
  });
}
test("explicit sharing and retry-safe joining preserve private bingo selections and journal links", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "publisher");
  const work = await add(
    owner.id,
    `SharedChallengeBook ${stamp} PRIVATE_SELECTION`,
  );
  const source = await create(page);
  const square = await db.challengeSquare.findFirstOrThrow({
    where: { challengeId: source },
    orderBy: { position: "asc" },
  });
  await db.challengeSquare.update({
    where: { id: square.id },
    data: { workId: work.id },
  });
  const context = await browser.newContext();
  const member = await context.newPage();
  const reader = await login(member, "joiner");
  expect(
    (
      await member.request.get(`/api/challenges/community?id=${source}`)
    ).status(),
  ).toBe(404);
  await page.goto("/community/challenges");
  await page.getByRole("button", { name: "Share challenge rules" }).click();
  await expect(
    page.getByRole("heading", { name: "Preview what readers will see" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel sharing change" }).click();
  expect(
    (await db.readingChallenge.findUniqueOrThrow({ where: { id: source } }))
      .isPublic,
  ).toBe(false);
  await page.getByRole("button", { name: "Share challenge rules" }).click();
  await page
    .getByRole("button", { name: "Confirm sharing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Withdraw shared challenge" }),
  ).toBeVisible();
  const publicData = await (
    await member.request.get(`/api/challenges/community?id=${source}`)
  ).json();
  const text = JSON.stringify(publicData);
  for (const secret of [
    owner.id,
    owner.email!,
    work.id,
    work.title,
    "PRIVATE_LIBRARY_NOTES",
    "PRIVATE_ACCOUNT_NAME",
    "completions",
    "workId",
    "userId",
  ])
    expect(text).not.toContain(secret);
  expect(publicData.templates[0].squares[0]).toEqual({
    position: 0,
    prompt: "Public prompt 1",
  });
  expect((await share(member, source, false, 1)).status()).toBe(404);
  await member.goto(`/community/challenges/discover?challenge=${source}`);
  await member
    .getByRole("button", { name: "Join challenge", exact: true })
    .click();
  await member.getByRole("button", { name: "Cancel join" }).click();
  expect(
    await db.readingChallenge.count({ where: { userId: reader.id } }),
  ).toBe(0);
  await member
    .getByRole("button", { name: "Join challenge", exact: true })
    .click();
  await member.route("**/api/challenges/community", async (route) => {
    if (route.request().method() === "POST") {
      await route.fetch();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Saved but response lost" }),
      });
    } else await route.continue();
  });
  await member.getByRole("button", { name: "Confirm join" }).click();
  await expect(
    member.getByRole("alert").filter({ hasText: "Saved but response lost" }),
  ).toBeVisible();
  await member.unroute("**/api/challenges/community");
  await member.getByRole("button", { name: "Confirm join" }).click();
  await expect(member).toHaveURL(/community\/challenges#/);
  const copy = await db.readingChallenge.findFirstOrThrow({
    where: { userId: reader.id, sourceId: source },
    include: { squares: { orderBy: { position: "asc" } } },
  });
  expect(
    await db.readingChallenge.count({
      where: { userId: reader.id, sourceId: source },
    }),
  ).toBe(1);
  expect(copy.isPublic).toBe(false);
  expect(copy.squares.every((s) => s.workId === null)).toBe(true);
  expect((await share(member, copy.id, true, 0)).status()).toBe(404);
  const book = await db.userBook.create({
    data: {
      userId: reader.id,
      editionId: (
        await db.edition.findFirstOrThrow({ where: { workId: work.id } })
      ).id,
      shelf: "read",
      dateFinished: new Date("2026-02-01"),
    },
  });
  expect(
    (
      await member.request.patch("/api/challenges", {
        data: {
          id: copy.id,
          squareId: copy.squares[0].id,
          version: 0,
          workId: work.id,
        },
      })
    ).status(),
  ).toBe(200);
  const journal = await (
    await member.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.challenges[0]).toMatchObject({ id: copy.id, count: 1 });
  const exported = await (
    await member.request.get("/api/library/export")
  ).json();
  expect(exported.challenges[0].sourceId).toBe(source);
  expect(exported.challenges[0].squares[0].workId).toBe(work.id);
  await page.getByRole("button", { name: "Withdraw shared challenge" }).click();
  await page.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(
    page.getByRole("button", { name: "Share challenge rules" }),
  ).toBeVisible();
  expect(
    (
      await member.request.get(`/api/challenges/community?id=${source}`)
    ).status(),
  ).toBe(404);
  expect((await join(member, source, 1)).status()).toBe(404);
  expect(
    await db.readingChallenge.count({
      where: { id: copy.id, deletedAt: null },
    }),
  ).toBe(1);
  expect((await share(page, source, true, 0)).status()).toBe(409);
  expect((await share(page, source, true, 2)).status()).toBe(200);
  expect((await join(member, source, 1)).status()).toBe(409);
  await db.user.delete({ where: { id: owner.id } });
  const kept = await db.readingChallenge.findUniqueOrThrow({
    where: { id: copy.id },
  });
  expect(kept.sourceId).toBeNull();
  expect(kept.isCommunityCopy).toBe(true);
  expect(
    await db.challengeSquare.count({ where: { challengeId: copy.id } }),
  ).toBe(9);
  expect((await share(member, copy.id, true, 0)).status()).toBe(404);
  await member.request.delete("/api/challenges", { data: { id: copy.id } });
  expect(
    (await (await member.request.get(`/api/library/${book.id}/journal`)).json())
      .challenges,
  ).toEqual([]);
  expect(
    await db.userBook.count({ where: { id: book.id, shelfPinned: false } }),
  ).toBe(1);
  await context.close();
});
test("community discovery paginates safely and deleted joins cannot be replayed", async ({
  page,
  browser,
}) => {
  const user = await login(page, "directory");
  const ids = Array.from({ length: 23 }, () => crypto.randomUUID());
  await db.readingChallenge.createMany({
    data: ids.map((id, i) => ({
      id,
      userId: user.id,
      title: `Directory ${stamp} ${i}`,
      target: 12,
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      isPublic: true,
      shareVersion: 1,
    })),
  });
  const context = await browser.newContext();
  const reader = await context.newPage();
  const other = await login(reader, "directoryreader");
  const first = await (
    await reader.request.get("/api/challenges/community?page=0")
  ).json();
  const second = await (
    await reader.request.get("/api/challenges/community?page=1")
  ).json();
  expect(first.templates).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(second.templates.length).toBeGreaterThanOrEqual(3);
  expect(
    first.templates.some((a: any) =>
      second.templates.some((b: any) => a.id === b.id),
    ),
  ).toBe(false);
  expect(
    (await reader.request.get("/api/challenges/community?page=-1")).status(),
  ).toBe(400);
  expect(
    (await reader.request.get("/api/challenges/community?id=bad")).status(),
  ).toBe(400);
  const source = ids[0],
    requestId = crypto.randomUUID();
  const replies = await Promise.all([
    join(reader, source, 1, requestId),
    join(reader, source, 1, requestId),
  ]);
  expect(replies.every((r) => r.ok())).toBe(true);
  expect(
    await db.readingChallenge.count({
      where: { userId: other.id, sourceId: source },
    }),
  ).toBe(1);
  await reader.request.delete("/api/challenges", { data: { id: requestId } });
  expect((await join(reader, source, 1, requestId)).status()).toBe(409);
  const rejoined = await join(reader, source, 1);
  expect(rejoined.status()).toBe(201);
  await page.request.delete("/api/challenges", { data: { id: source } });
  expect((await join(reader, source, 1)).status()).toBe(404);
  expect((await share(page, source, true, 1)).status()).toBe(404);
  await reader.goto("/community/challenges/discover");
  await expect(reader.getByRole("button", { name: "Next page" })).toBeEnabled();
  await reader.getByRole("button", { name: "Next page" }).click();
  await expect(reader.getByText("Page 2", { exact: true })).toBeVisible();
  await reader.setViewportSize({ width: 390, height: 844 });
  expect(
    await reader.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await reader.screenshot({
    path: "test-results/community-challenges-mobile.png",
  });
  await context.close();
});
