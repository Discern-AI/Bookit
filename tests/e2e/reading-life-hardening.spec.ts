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
  browser,
}) => {
  const user = await login(page, "owner");
  await db.user.update({
    where: { id: user.id },
    data: {
      username: `kit-creator-${stamp}`,
      publicName: "Reading Kit Creator",
      profilePublic: true,
    },
  });
  const work = await addBook(user.id);
  const userBook = work.editions[0].userBooks[0];
  const kitId = crypto.randomUUID();
  const kit = {
    title: "Rainy afternoon kit",
    notes: "PRIVATE_KIT_NOTE",
    makeDo: "Existing blanket",
    sensoryProfile: "Warm lamp and quiet music",
    creatorEssay: "PRIVATE_CREATOR_ESSAY",
    playlistUrl: "https://example.com/private-playlist",
    suggestedOrder: "Read the essay, then the book.",
    publicDescription:
      "A public rainy-day ritual with one book and familiar objects.",
    budgetTier: "make_do",
    isPublic: true,
    entries: [{ workId: work.id, note: "Kit book" }],
    items: [
      {
        kind: "reading_object",
        title: "Favourite bookmark",
        details: "Use the one already at home.",
        externalUrl: "https://example.com/bookmark",
      },
    ],
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
  await expect(page.getByText("PRIVATE_CREATOR_ESSAY")).toBeVisible();
  await expect(page.getByText("Favourite bookmark")).toBeVisible();
  await expect(page.getByText("published", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Reading kit", { exact: true })).toContainText(
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

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`/kit/${kitId}`);
  await expect(
    publicPage.getByRole("heading", { name: "Updated rainy kit" }),
  ).toBeVisible();
  await expect(publicPage.getByText("PRIVATE_CREATOR_ESSAY")).toBeVisible();
  await expect(publicPage.getByText("PRIVATE_KIT_NOTE")).toHaveCount(0);
  await expect(
    publicPage.getByRole("link", { name: "Created by Reading Kit Creator" }),
  ).toBeVisible();
  await publicPage.goto("/community/kits");
  await expect(
    publicPage.getByRole("link", { name: "Updated rainy kit" }),
  ).toBeVisible();

  const reporterContext = await browser.newContext();
  const reporterPage = await reporterContext.newPage();
  const reporter = await login(reporterPage, "kit-reporter");
  await reporterPage.goto(`/kit/${kitId}`);
  await reporterPage.getByRole("button", { name: "Save kit" }).click();
  await expect(
    reporterPage.getByRole("button", { name: "Remove saved kit" }),
  ).toBeVisible();
  await reporterPage.getByRole("button", { name: "Follow reader" }).click();
  await expect(
    reporterPage.getByRole("button", { name: "Unfollow" }),
  ).toBeVisible();
  expect(
    await db.readingKitSave.count({
      where: { kitId, userId: reporter.id },
    }),
  ).toBe(1);
  await reporterPage.goto("/community/kits?scope=saved");
  await expect(
    reporterPage.getByRole("link", { name: "Updated rainy kit" }),
  ).toBeVisible();
  const reporterExport = await (
    await reporterPage.request.get("/api/library/export")
  ).json();
  expect(reporterExport.readingKitSaves[0].kitId).toBe(kitId);
  expect(
    (
      await reporterPage.request.post(`/api/reading-kits/${kitId}/report`, {
        data: {
          reason: "misleading",
          details: "Please review this public kit.",
        },
      })
    ).status(),
  ).toBe(200);
  const kitReport = await db.readingKitReport.findFirstOrThrow({
    where: { kitId, reporterId: reporter.id },
  });
  expect(JSON.stringify(kitReport.publicContent)).not.toContain(
    "PRIVATE_KIT_NOTE",
  );
  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  const moderator = await login(moderatorPage, "kit-moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  expect(
    (
      await moderatorPage.request.patch(
        `/api/moderation/reading-kits/${kitReport.id}`,
        {
          data: {
            action: "hide",
            version: 2,
            note: "Hidden for a public-content review.",
          },
        },
      )
    ).status(),
  ).toBe(200);
  const updatedKit = { ...kit, title: "Updated rainy kit" };
  expect(
    (
      await page.request.post("/api/reading-kits", {
        data: { kitId, version: 3, kit: updatedKit },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await db.readingKit.findUniqueOrThrow({ where: { id: kitId } }))
      .publicModerationStatus,
  ).toBe("hidden");
  await publicPage.goto(`/kit/${kitId}`);
  await expect(
    publicPage.getByRole("heading", { name: "Updated rainy kit" }),
  ).toHaveCount(0);
  await reporterPage.goto("/community/kits?scope=saved");
  await expect(
    reporterPage.getByRole("link", { name: "Updated rainy kit" }),
  ).toHaveCount(0);
  expect(
    (
      await moderatorPage.request.patch(
        `/api/moderation/reading-kits/${kitReport.id}`,
        {
          data: {
            action: "restore",
            version: 4,
            note: "Restored after a second review.",
          },
        },
      )
    ).status(),
  ).toBe(200);
  await publicPage.goto(`/kit/${kitId}`);
  await expect(
    publicPage.getByRole("heading", { name: "Updated rainy kit" }),
  ).toBeVisible();
  await publicPage
    .getByRole("link", { name: "Created by Reading Kit Creator" })
    .click();
  await expect(
    publicPage.getByRole("heading", { name: "Reading Kit Creator" }),
  ).toBeVisible();
  await publicPage.getByRole("link", { name: "Reading Kits" }).click();
  await expect(
    publicPage.getByRole("link", { name: "Updated rainy kit" }),
  ).toBeVisible();
  await reporterPage.goto("/community/kits?scope=saved");
  await expect(
    reporterPage.getByRole("link", { name: "Updated rainy kit" }),
  ).toBeVisible();
  await publicContext.close();
  await reporterContext.close();
  await moderatorContext.close();

  const pagedKits = Array.from({ length: 25 }, (_, index) => ({
    id: crypto.randomUUID(),
    userId: user.id,
    title: `Paged kit ${String(index).padStart(2, "0")}`,
    notes: index % 2 ? "Window reading" : "Evening reading",
    makeDo: "Use the chair already at home.",
    sensoryProfile: "A familiar lamp.",
    publicDescription: `A public pagination fixture ${String(index).padStart(2, "0")}.`,
    budgetTier: "make_do",
    isPublic: true,
    publishedAt: new Date(Date.now() + index * 1000),
    updatedAt: new Date(Date.now() + index * 1000),
  }));
  await db.readingKit.createMany({
    data: pagedKits,
  });
  await db.readingKitItem.createMany({
    data: pagedKits.map((kit, index) => ({
      kitId: kit.id,
      position: 0,
      kind: "reading_object",
      title: `Paged object ${String(index).padStart(2, "0")}`,
      details: "Already at home.",
      externalUrl: "",
    })),
  });
  const discoveryContext = await browser.newContext();
  const discoveryPage = await discoveryContext.newPage();
  await discoveryPage.goto(
    "/community/kits?q=Paged&budget=make_do&content=items",
  );
  await expect(
    discoveryPage.getByRole("link", { name: "Paged kit 24" }),
  ).toBeVisible();
  await expect(
    discoveryPage.getByRole("link", { name: "Paged kit 00" }),
  ).toHaveCount(0);
  await discoveryPage.getByRole("link", { name: "Next page" }).click();
  await expect(
    discoveryPage.getByRole("link", { name: "Paged kit 00" }),
  ).toBeVisible();
  await discoveryPage.getByLabel("Search public kits").fill("Updated rainy");
  await discoveryPage.getByLabel("Includes").selectOption("books");
  await discoveryPage.getByRole("button", { name: "Search kits" }).click();
  await expect(
    discoveryPage.getByRole("link", { name: "Updated rainy kit" }),
  ).toBeVisible();
  await discoveryContext.close();
  await db.readingAfternoon.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      date: new Date(Date.now() + (index + 1) * 86400000),
      durationMinutes: 60,
      place: `Paged place ${String(index).padStart(2, "0")}`,
      weather: "indoors",
      pace: "steady",
      notes: index % 2 ? "Window plan" : "Evening plan",
      status: "planned",
    })),
  });
  await page.reload();
  const kitRegion = page.getByRole("region", { name: "Saved kits" });
  await expect(kitRegion.getByRole("article")).toHaveCount(20);
  await kitRegion.getByRole("button", { name: "Load more kits" }).click();
  await expect(kitRegion.getByRole("article")).toHaveCount(26);
  await kitRegion
    .getByRole("textbox", { name: "Search reading kits" })
    .fill("Paged kit 24");
  await kitRegion.getByRole("button", { name: "Search kits" }).click();
  await expect(kitRegion.getByRole("article")).toHaveCount(1);
  await expect(
    kitRegion.getByText("Paged kit 24", { exact: true }),
  ).toBeVisible();
  const afternoonRegion = page.getByRole("region", {
    name: "Your reading afternoons",
  });
  await expect(afternoonRegion.getByRole("article")).toHaveCount(20);
  await afternoonRegion
    .getByRole("button", { name: "Load more afternoons" })
    .click();
  await expect(afternoonRegion.getByRole("article")).toHaveCount(26);
  await afternoonRegion
    .getByRole("textbox", { name: "Search reading afternoons" })
    .fill("Paged place 24");
  await afternoonRegion
    .getByRole("button", { name: "Search afternoons" })
    .click();
  await expect(afternoonRegion.getByRole("article")).toHaveCount(1);
  await expect(afternoonRegion.getByText("Paged place 24")).toBeVisible();

  await db.bookshopOutcome.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      shopName: `Paged shop ${String(index).padStart(2, "0")}`,
      outcome: "visited",
      notes: index % 2 ? "Asked about a copy" : "Browsed the shelves",
      externalUrl: "",
      createdAt: new Date(Date.now() + index * 1000),
    })),
  });

  await page.goto("/library/bookshops");
  const outcomeRegion = page.getByRole("region", {
    name: "Saved bookshop outcomes",
  });
  await expect(outcomeRegion.getByRole("article")).toHaveCount(20);
  await outcomeRegion
    .getByRole("button", { name: "Load more outcomes" })
    .click();
  await expect(outcomeRegion.getByRole("article")).toHaveCount(26);
  await outcomeRegion
    .getByRole("textbox", { name: "Search bookshop outcomes" })
    .fill("Paged shop 24");
  await outcomeRegion.getByRole("button", { name: "Search outcomes" }).click();
  await expect(outcomeRegion.getByRole("article")).toHaveCount(1);
  await expect(
    outcomeRegion.getByText("Paged shop 24", { exact: true }),
  ).toBeVisible();
  await outcomeRegion
    .getByRole("textbox", { name: "Search bookshop outcomes" })
    .fill("Local Books");
  await outcomeRegion.getByRole("button", { name: "Search outcomes" }).click();
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
  expect(exported.readingKits[0].creatorEssay).toBe("PRIVATE_CREATOR_ESSAY");
  expect(exported.readingKits[0].items[0].title).toBe("Favourite bookmark");
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
    ["/api/reading-kits", { kitId, version: 5 }],
  ] as const)
    expect((await page.request.delete(url, { data })).status()).toBe(200);

  const deletedKit = await db.readingKit.findUniqueOrThrow({
    where: { id: kitId },
  });
  expect(
    deletedKit.title +
      deletedKit.notes +
      deletedKit.sensoryProfile +
      deletedKit.creatorEssay +
      deletedKit.playlistUrl +
      deletedKit.suggestedOrder,
  ).toBe("");
  expect(await db.readingKitEntry.count({ where: { kitId } })).toBe(0);
  expect(await db.readingKitItem.count({ where: { kitId } })).toBe(0);
  expect(await db.readingKitSave.count({ where: { kitId } })).toBe(0);
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
        data: { kitId, version: 5, kit },
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
