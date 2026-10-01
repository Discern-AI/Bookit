import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "charity-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `charity-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `charity-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `CharityBook ${stamp}` } },
  });
  await db.$disconnect();
});

async function create(page: Page) {
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.post("/api/challenges", {
        data: {
          id,
          title: "Read for charity",
          target: 10,
          startsOn: "2026-01-01",
          endsOn: "2026-12-31",
          genre: null,
        },
      })
    ).status(),
  ).toBe(201);
  return id;
}
async function tracking(page: Page, id: string) {
  const d = await (await page.request.get("/api/challenges")).json();
  return d.challenges.find((c: any) => c.id === id).fundraising;
}
async function save(page: Page, id: string, data: unknown) {
  return page.request.patch(`/api/challenges/${id}/fundraising`, { data });
}
test("charity forms retain drafts, use reading progress and keep sponsor data out of community copies", async ({
  page,
  browser,
}) => {
  const user = await login(page, "owner");
  const work = await add(user.id, `CharityBook ${stamp} read`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: user.id },
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
    ],
  });
  const id = await create(page);
  await page.goto("/community/challenges");
  await page.getByRole("button", { name: "Set up charity tracking" }).click();
  await page.getByLabel("Charity name").fill("PRIVATE_CHARITY");
  await page.getByLabel("Fundraising target (GBP, optional)").fill("100");
  await page.getByRole("button", { name: "Save charity details" }).click();
  await expect(
    page.getByText("PRIVATE_CHARITY", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add sponsor pledge" }).click();
  await page.getByLabel("Sponsor label").fill("PRIVATE_SPONSOR");
  await page.getByLabel("Pledge amount (GBP)").fill("2.50");
  await page.getByLabel("Pledge cap (GBP, optional)").fill("4.00");
  await page.getByLabel("Recorded as received (GBP)").fill("1.00");
  await page.route(`**/api/challenges/${id}/fundraising`, async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary tracking failure" }),
    }),
  );
  await page.getByRole("button", { name: "Save pledge", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary tracking failure" }),
  ).toBeVisible();
  await expect(page.getByLabel("Sponsor label")).toHaveValue("PRIVATE_SPONSOR");
  await page.unroute(`**/api/challenges/${id}/fundraising`);
  await page.getByRole("button", { name: "Save pledge", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "PRIVATE_SPONSOR" }),
  ).toBeVisible();
  let c = await tracking(page, id);
  expect(c).toMatchObject({
    expectedPence: 400,
    receivedPence: 100,
    outstandingPence: 300,
  });
  const pledge = c.pledges[0];
  await page.getByRole("button", { name: "Edit pledge", exact: true }).click();
  await page.getByLabel("Recorded as received (GBP)").fill("3.00");
  expect(
    (
      await save(page, id, {
        action: "pledge",
        id: pledge.id,
        version: pledge.version,
        label: pledge.label,
        mode: pledge.mode,
        amountPence: 250,
        capPence: 400,
        receivedPence: 200,
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save pledge", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await expect(page.getByLabel("Recorded as received (GBP)")).toHaveValue(
    "3.00",
  );
  await page
    .getByRole("button", { name: "Discard draft and reload tracking" })
    .click();
  await db.readingCycle.updateMany({
    where: { userBookId: book.id },
    data: { dateFinished: null },
  });
  c = await tracking(page, id);
  expect(c).toMatchObject({
    expectedPence: 0,
    receivedPence: 200,
    outstandingPence: 0,
    excessPence: 200,
  });
  await db.readingCycle.updateMany({
    where: { userBookId: book.id, isCurrent: true },
    data: { dateFinished: new Date("2026-04-01") },
  });
  const journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.challenges[0].id).toBe(id);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.challenges[0].fundraising.pledges[0].label).toBe(
    "PRIVATE_SPONSOR",
  );
  await page.request.patch("/api/challenges/community", {
    data: { id, version: 0, isPublic: true },
  });
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, "other");
  const publicData = await (
    await other.request.get(`/api/challenges/community?id=${id}`)
  ).json();
  expect(JSON.stringify(publicData)).not.toContain("PRIVATE_CHARITY");
  expect(JSON.stringify(publicData)).not.toContain("PRIVATE_SPONSOR");
  expect(JSON.stringify(publicData)).not.toContain("fundraising");
  expect(
    (
      await save(other, id, {
        action: "campaign",
        version: 0,
        charityName: "Wrong",
        targetPence: null,
      })
    ).status(),
  ).toBe(404);
  const copyId = crypto.randomUUID();
  expect(
    (
      await other.request.post("/api/challenges/community", {
        data: { id: copyId, sourceId: id, version: 1 },
      })
    ).status(),
  ).toBe(201);
  expect(await tracking(other, copyId)).toBeNull();
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("region", { name: "Charity tracking" })
    .screenshot({ path: "test-results/charity-mobile.png" });
  await page
    .getByRole("button", { name: "Remove pledge", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel charity edit" }).click();
  expect((await tracking(page, id)).pledges).toHaveLength(1);
  await page
    .getByRole("button", { name: "Remove pledge", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm remove pledge" }).click();
  await expect(
    page.getByRole("heading", { name: "PRIVATE_SPONSOR" }),
  ).toHaveCount(0);
  expect(
    (
      await save(page, id, {
        action: "pledge",
        id: pledge.id,
        version: 0,
        label: pledge.label,
        mode: pledge.mode,
        amountPence: 250,
        capPence: 400,
        receivedPence: 100,
      })
    ).status(),
  ).toBe(409);
  expect(
    (await db.sponsorPledge.findUniqueOrThrow({ where: { id: pledge.id } }))
      .label,
  ).toBe("");
  expect(
    await db.userBook.count({ where: { id: book.id, shelfPinned: false } }),
  ).toBe(1);
  expect(await db.work.count({ where: { id: work.id } })).toBe(1);
  await context.close();
});
test("charity creation retries, flat pledges and deletion preserve other readers", async ({
  page,
}) => {
  const user = await login(page, "lifecycle");
  const id = await create(page);
  const data = {
    action: "campaign",
    version: null,
    charityName: "Local charity",
    targetPence: null,
  };
  const replies = await Promise.all([
    save(page, id, data),
    save(page, id, data),
  ]);
  expect(replies.every((r) => r.ok())).toBe(true);
  expect(
    (
      await save(page, id, { ...data, charityName: "Conflicting setup" })
    ).status(),
  ).toBe(409);
  const pledge = {
    action: "pledge",
    id: crypto.randomUUID(),
    version: 0,
    label: "Flat sponsor",
    mode: "flat",
    amountPence: 1000,
    capPence: null,
    receivedPence: 1200,
  };
  expect((await save(page, id, pledge)).status()).toBe(201);
  expect((await save(page, id, pledge)).status()).toBe(200);
  expect(await tracking(page, id)).toMatchObject({
    expectedPence: 1000,
    receivedPence: 1200,
    outstandingPence: 0,
    excessPence: 200,
  });
  expect((await save(page, id, { ...pledge, amountPence: 1.5 })).status()).toBe(
    400,
  );
  expect(
    (await save(page, id, { ...pledge, receivedPence: -1 })).status(),
  ).toBe(400);
  const second = await create(page);
  expect((await save(page, second, data)).status()).toBe(201);
  expect((await save(page, second, pledge)).status()).toBe(404);
  await page.request.delete("/api/challenges", { data: { id } });
  expect(await db.charityCampaign.count({ where: { challengeId: id } })).toBe(
    0,
  );
  expect(await db.sponsorPledge.count({ where: { id: pledge.id } })).toBe(0);
  expect((await save(page, id, data)).status()).toBe(404);
  expect((await save(page, id, pledge)).status()).toBe(404);
  await save(page, second, { ...pledge, id: crypto.randomUUID() });
  await db.user.delete({ where: { id: user.id } });
  expect(
    await db.charityCampaign.count({ where: { challengeId: second } }),
  ).toBe(0);
  expect(await db.sponsorPledge.count({ where: { campaignId: second } })).toBe(
    0,
  );
});
