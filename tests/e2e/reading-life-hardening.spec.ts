import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const stamp = Date.now();
const password = "reading-life-hardening-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(page: Page, suffix: string) {
  const email = `reading-life-hardening-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Private reader", email, password },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password },
  });
  return db.user.findUniqueOrThrow({ where: { email } });
}

async function addBook(userId: string) {
  return db.work.create({
    data: {
      title: `Reading Life ${stamp}`,
      authorName: "A. Planner",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "paperback",
          userBooks: { create: { userId, shelf: "read" } },
        },
      },
    },
    include: { editions: { include: { userBooks: true } } },
  });
}

test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `reading-life-hardening-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Reading Life ${stamp}` } },
  });
  await db.$disconnect();
});

test("Reading Life writes are retry-safe, journalled, exported and erased", async ({
  page,
}) => {
  const user = await login(page, "owner");
  const work = await addBook(user.id);
  const userBook = work.editions[0].userBooks[0];
  const kitId = crypto.randomUUID();
  const kit = {
    title: "Rainy afternoon kit",
    notes: "PRIVATE_KIT_NOTE",
    makeDo: "Existing blanket",
    sensoryProfile: "Warm lamp and quiet music",
    budgetTier: "make_do",
    isPublic: false,
    entries: [{ workId: work.id, note: "Kit book" }],
  };
  const firstKit = await page.request.post("/api/reading-kits", {
    data: { kitId, version: 0, kit },
  });
  expect(firstKit.status()).toBe(200);
  expect((await firstKit.json()).version).toBe(1);
  const repeatedKit = await page.request.post("/api/reading-kits", {
    data: { kitId, version: 0, kit },
  });
  expect(repeatedKit.status()).toBe(200);
  expect(await db.readingKit.count({ where: { id: kitId } })).toBe(1);

  const afternoonId = crypto.randomUUID();
  const afternoon = {
    date: "2026-11-07T14:00:00.000Z",
    durationMinutes: 90,
    place: "home",
    weather: "rainy",
    pace: "steady",
    workId: work.id,
    kitId,
    notes: "PRIVATE_AFTERNOON_NOTE",
    status: "planned",
  };
  expect(
    (
      await page.request.post("/api/reading-afternoons", {
        data: { afternoonId, version: 0, afternoon },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/reading-afternoons", {
        data: { afternoonId, version: 0, afternoon },
      })
    ).status(),
  ).toBe(200);
  expect(await db.readingAfternoon.count({ where: { id: afternoonId } })).toBe(
    1,
  );

  const outcomeId = crypto.randomUUID();
  const outcome = {
    workId: work.id,
    shopName: "Local Books",
    outcome: "found_copy",
    notes: "PRIVATE_SHOP_NOTE",
    externalUrl: "https://www.google.com/maps/search/bookshops/@51.5,-0.1,12z",
  };
  expect(
    (
      await page.request.post("/api/bookshop-outcomes", {
        data: { outcomeId, version: 0, outcome },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/bookshop-outcomes", {
        data: { outcomeId, version: 0, outcome },
      })
    ).status(),
  ).toBe(200);
  const storedOutcome = await db.bookshopOutcome.findUniqueOrThrow({
    where: { id: outcomeId },
  });
  expect(storedOutcome.externalUrl).toBe("");
  expect(await db.bookshopOutcome.count({ where: { id: outcomeId } })).toBe(1);

  await page.goto("/library/reading-life");
  await page
    .getByRole("article")
    .filter({ hasText: "Rainy afternoon kit" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Kit title").fill("Updated rainy kit");
  await page.getByRole("button", { name: "Save kit changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Updated rainy kit", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Reading kit")).toContainText(
    "Updated rainy kit",
  );
  await page
    .getByRole("article")
    .filter({ hasText: "90 minutes" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Notes").fill("PRIVATE_AFTERNOON_NOTE_UPDATED");
  await page.getByRole("button", { name: "Save afternoon changes" }).click();
  await expect(page.getByText("PRIVATE_AFTERNOON_NOTE_UPDATED")).toBeVisible();

  await page.goto("/library/bookshops");
  await page
    .getByRole("article")
    .filter({ hasText: "Local Books" })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Shop name").fill("Updated Local Books");
  await page.getByRole("button", { name: "Save outcome changes" }).click();
  await expect(
    page.getByText("Updated Local Books", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  const journal = await (
    await page.request.get(`/api/library/${userBook.id}/journal`)
  ).json();
  expect(journal.readingKits[0].title).toBe("Updated rainy kit");
  expect(journal.readingAfternoons[0].id).toBe(afternoonId);
  expect(journal.bookshopOutcomes[0].id).toBe(outcomeId);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.readingKits[0].notes).toBe("PRIVATE_KIT_NOTE");
  expect(exported.readingAfternoons[0].notes).toBe(
    "PRIVATE_AFTERNOON_NOTE_UPDATED",
  );
  expect(exported.bookshopOutcomes[0].notes).toBe("PRIVATE_SHOP_NOTE");

  await page.goto(`/library/book/${userBook.id}`);
  await expect(
    page.getByRole("region", { name: "Your Reading Life plans" }),
  ).toContainText("Updated rainy kit");
  await expect(
    page.getByRole("region", { name: "Your Reading Life plans" }),
  ).toContainText("Updated Local Books");

  expect(
    (
      await page.request.post("/api/reading-kits", {
        headers: { Origin: "https://other.test" },
        data: { kitId: crypto.randomUUID(), version: 0, kit },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.delete("/api/bookshop-outcomes", {
        data: { outcomeId, version: 1 },
      })
    ).status(),
  ).toBe(409);

  for (const [url, data] of [
    ["/api/reading-afternoons", { afternoonId, version: 2 }],
    ["/api/bookshop-outcomes", { outcomeId, version: 2 }],
    ["/api/reading-kits", { kitId, version: 2 }],
  ] as const)
    expect((await page.request.delete(url, { data })).status()).toBe(200);

  const deletedKit = await db.readingKit.findUniqueOrThrow({
    where: { id: kitId },
  });
  expect(deletedKit.title + deletedKit.notes + deletedKit.sensoryProfile).toBe(
    "",
  );
  expect(await db.readingKitEntry.count({ where: { kitId } })).toBe(0);
  const deletedAfternoon = await db.readingAfternoon.findUniqueOrThrow({
    where: { id: afternoonId },
  });
  expect(deletedAfternoon.notes).toBe("");
  expect(deletedAfternoon.workId).toBeNull();
  const deletedOutcome = await db.bookshopOutcome.findUniqueOrThrow({
    where: { id: outcomeId },
  });
  expect(
    deletedOutcome.notes + deletedOutcome.shopName + deletedOutcome.externalUrl,
  ).toBe("");
  expect(deletedOutcome.workId).toBeNull();
  expect(
    (
      await page.request.post("/api/reading-kits", {
        data: { kitId, version: 2, kit },
      })
    ).status(),
  ).toBe(409);
});

test("public videos remain public while owner edits preserve moderation", async ({
  page,
  browser,
}) => {
  const user = await login(page, "video");
  const work = await addBook(user.id);
  const videoId = crypto.randomUUID();
  await db.videoProject.create({
    data: {
      id: videoId,
      userId: user.id,
      title: "A public reading video",
      platform: "other",
      status: "editing",
      script: "PRIVATE_SCRIPT",
      notes: "PRIVATE_NOTES",
      isPublic: true,
      publicDescription: "A public description for readers.",
      publicModerationStatus: "hidden",
      publishedAt: new Date(),
      books: { create: { workId: work.id, position: 0 } },
      clip: {
        create: {
          mimeType: "video/webm",
          data: Uint8Array.from([26, 69, 223, 163]),
        },
      },
    },
    include: { clip: true },
  });
  const project = {
    title: "An edited public reading video",
    platform: "other",
    status: "editing",
    script: "PRIVATE_SCRIPT_EDITED",
    notes: "PRIVATE_NOTES_EDITED",
    publishedUrl: "",
    isPublic: true,
    publicDescription: "An edited public description.",
    additionalLinks: [],
    books: [{ workId: work.id }],
  };
  expect(
    (
      await page.request.patch("/api/video-projects", {
        data: { action: "save", id: videoId, version: 1, project },
      })
    ).status(),
  ).toBe(200);
  const hidden = await db.videoProject.findUniqueOrThrow({
    where: { id: videoId },
  });
  expect(hidden.publicModerationStatus).toBe("hidden");
  const moderatorContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
  });
  const moderatorPage = await moderatorContext.newPage();
  const moderator = await login(moderatorPage, "moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const report = await db.videoProjectReport.create({
    data: {
      projectId: videoId,
      reporterId: moderator.id,
      version: 1,
      title: "A public reading video",
      publicDescription: "A public description for readers.",
      linkedWorkIds: [work.id],
      reason: "other",
      details: "Fixture report",
      status: "hidden",
      decisionVersion: 1,
      note: "Fixture restriction",
      resolvedById: moderator.id,
      resolvedAt: new Date(),
    },
  });
  expect(
    (
      await moderatorPage.request.patch(
        `/api/moderation/video-projects/${report.id}`,
        {
          data: {
            action: "restore",
            version: hidden.version,
            note: "Reviewed corrected public content.",
          },
        },
      )
    ).status(),
  ).toBe(200);
  expect(
    (await db.videoProject.findUniqueOrThrow({ where: { id: videoId } }))
      .publicModerationStatus,
  ).toBe("active");
  await moderatorContext.close();
  const anonymous = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
  });
  const publicPage = await anonymous.newPage();
  await publicPage.goto(`/video/${videoId}`);
  await expect(
    publicPage.getByRole("heading", { name: "An edited public reading video" }),
  ).toBeVisible();
  await publicPage.goto("/community/videos");
  await expect(
    publicPage.getByRole("link", { name: "An edited public reading video" }),
  ).toBeVisible();
  expect(
    (
      await page.request.post(`/api/video-projects/${videoId}/report`, {
        headers: { Origin: "https://other.test" },
        data: { reason: "spam", details: "No" },
      })
    ).status(),
  ).toBe(403);
  await anonymous.close();
});
