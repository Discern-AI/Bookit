import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const stamp = Date.now();
const password = "marketplace-foundation-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(page: Page, suffix: string) {
  const email = `marketplace-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: `Marketplace ${suffix}`, email, password },
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
      title: `Marketplace Book ${stamp}`,
      authorName: "M. Maker",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "hardback",
          userBooks: { create: { userId, shelf: "read" } },
        },
      },
    },
    include: { editions: { include: { userBooks: true } } },
  });
}

test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `marketplace-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Marketplace Book ${stamp}` } },
  });
  await db.$disconnect();
});

test("published listings are retry-safe, saveable, journalled and revoked on unpublish", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const owner = await login(ownerPage, "owner");
  const work = await addBook(owner.id);
  const userBook = work.editions[0].userBooks[0];
  const listingId = crypto.randomUUID();
  const listing = {
    kind: "book",
    category: "books_collecting",
    title: "A clothbound reading copy",
    description: "A durable edition idea.",
    makeDoAlternative: "Wrap the copy you own in reusable paper.",
    budgetTier: "collector",
    pricePence: 2499,
    externalUrl: "https://example.com/clothbound",
    workId: work.id,
    isPublished: true,
  };
  const created = await ownerPage.request.post("/api/marketplace", {
    data: { listingId, version: 0, listing },
  });
  expect(created.status()).toBe(200);
  expect((await created.json()).version).toBe(1);
  const retried = await ownerPage.request.post("/api/marketplace", {
    data: { listingId, version: 0, listing },
  });
  expect(retried.status()).toBe(200);
  expect(await db.marketplaceListing.count({ where: { id: listingId } })).toBe(
    1,
  );
  await db.marketplaceListing.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      id: crypto.randomUUID(),
      userId: owner.id,
      kind: "reading_object",
      category: "reading_objects",
      title: `Paged idea ${String(index).padStart(2, "0")}`,
      description: index % 2 ? "A lamp idea" : "A bookmark idea",
      makeDoAlternative: "Use a familiar object already at home.",
      budgetTier: index % 2 ? "comfortable" : "make_do",
      pricePence: 500 + index,
      externalUrl: `https://example.com/object-${index}`,
      isPublished: true,
      updatedAt: new Date(Date.now() + index * 1000),
    })),
  });

  const invalid = await ownerPage.request.post("/api/marketplace", {
    data: {
      listingId: crypto.randomUUID(),
      version: 0,
      listing: { ...listing, externalUrl: "", title: "No purchase path" },
    },
  });
  expect(invalid.status()).toBe(400);
  expect(
    (
      await ownerPage.request.post("/api/marketplace", {
        headers: { Origin: "https://attacker.example" },
        data: { listingId: crypto.randomUUID(), version: 0, listing },
      })
    ).status(),
  ).toBe(403);

  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  const reader = await login(readerPage, "reader");
  await db.userBook.create({
    data: { userId: reader.id, editionId: work.editions[0].id, shelf: "read" },
  });
  await readerPage.goto("/library/marketplace");
  await expect(readerPage.locator("article")).toHaveCount(20);
  await readerPage.getByRole("button", { name: "Load more ideas" }).click();
  await expect(readerPage.locator("article")).toHaveCount(26);
  await readerPage
    .getByRole("textbox", { name: "Search marketplace" })
    .fill("Paged idea 24");
  await readerPage.getByRole("button", { name: "Search marketplace" }).click();
  await expect(readerPage.locator("article")).toHaveCount(1);
  await expect(
    readerPage.getByRole("heading", { name: "Paged idea 24" }),
  ).toBeVisible();
  await readerPage
    .getByRole("textbox", { name: "Search marketplace" })
    .fill("");
  await readerPage.getByLabel("Category").selectOption("book");
  await readerPage.getByRole("button", { name: "Search marketplace" }).click();
  await expect(
    readerPage.getByRole("heading", { name: listing.title }),
  ).toBeVisible();
  await expect(readerPage.getByText("Use what you have:")).toBeVisible();
  await readerPage.getByRole("button", { name: "Save idea" }).click();
  await expect(
    readerPage.getByRole("button", { name: "Remove saved idea" }),
  ).toBeVisible();

  const readerBook = await db.userBook.findFirstOrThrow({
    where: { userId: reader.id, edition: { workId: work.id } },
  });
  const journal = await (
    await readerPage.request.get(`/api/library/${readerBook.id}/journal?page=0`)
  ).json();
  expect(journal.marketplaceSaves[0].id).toBe(listingId);
  const exported = await (
    await readerPage.request.get("/api/library/export")
  ).json();
  expect(exported.marketplaceSaves[0].listing.id).toBe(listingId);

  await readerPage.getByRole("button", { name: "Report" }).click();
  await readerPage
    .getByLabel("Report details")
    .fill("This listing needs a moderator review.");
  await readerPage.getByRole("button", { name: "Send report" }).click();
  await expect(readerPage.getByRole("status")).toHaveText(
    "Report sent for review.",
  );
  const report = await db.marketplaceReport.findFirstOrThrow({
    where: { listingId, reporterId: reader.id },
  });
  expect(report.title).toBe(listing.title);
  expect(report.description).toBe(listing.description);
  expect(
    (
      await readerPage.request.post(`/api/marketplace/${listingId}/report`, {
        headers: { Origin: "https://attacker.example" },
        data: { reason: "spam", details: "Foreign origin report." },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await ownerPage.request.post(`/api/marketplace/${listingId}/report`, {
        data: { reason: "other", details: "Owner self report." },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await readerPage.request.patch(
        `/api/moderation/marketplace/${report.id}`,
        {
          data: { action: "hide", version: 1, note: "Reader cannot moderate." },
        },
      )
    ).status(),
  ).toBe(403);

  const moderatorContext = await browser.newContext();
  const moderatorPage = await moderatorContext.newPage();
  const moderator = await login(moderatorPage, "moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const hidden = await moderatorPage.request.patch(
    `/api/moderation/marketplace/${report.id}`,
    {
      data: {
        action: "hide",
        version: 1,
        note: "Hidden after public listing review.",
      },
    },
  );
  expect(hidden.status()).toBe(200);
  expect(
    await db.marketplaceSave.count({ where: { listingId, userId: reader.id } }),
  ).toBe(0);
  const editedListing = {
    ...listing,
    description: "Owner edit after moderation.",
  };
  const ownerEdit = await ownerPage.request.post("/api/marketplace", {
    data: { listingId, version: 2, listing: editedListing },
  });
  expect(ownerEdit.status()).toBe(200);
  expect(
    (
      await db.marketplaceListing.findUniqueOrThrow({
        where: { id: listingId },
      })
    ).moderationStatus,
  ).toBe("hidden");
  const hiddenSearch = await (
    await readerPage.request.get(
      `/api/marketplace?q=${encodeURIComponent(listing.title)}`,
    )
  ).json();
  expect(hiddenSearch.listings).toHaveLength(0);
  const restored = await moderatorPage.request.patch(
    `/api/moderation/marketplace/${report.id}`,
    {
      data: {
        action: "restore",
        version: 3,
        note: "Restored after a second review.",
      },
    },
  );
  expect(restored.status()).toBe(200);

  const unpublished = await ownerPage.request.post("/api/marketplace", {
    data: {
      listingId,
      version: 4,
      listing: { ...editedListing, isPublished: false },
    },
  });
  expect(unpublished.status()).toBe(200);
  expect(
    await db.marketplaceSave.count({ where: { listingId, userId: reader.id } }),
  ).toBe(0);
  await readerPage.reload();
  await expect(
    readerPage.getByRole("heading", { name: listing.title }),
  ).toHaveCount(0);

  await ownerPage.goto("/library/marketplace");
  await ownerPage
    .getByRole("textbox", { name: "Search marketplace" })
    .fill(listing.title);
  await ownerPage.getByLabel("Show").selectOption("mine");
  await ownerPage.getByRole("button", { name: "Search marketplace" }).click();
  await expect(ownerPage.getByText("Private draft")).toBeVisible();
  await expect(
    ownerPage.getByRole("heading", { name: listing.title }),
  ).toBeVisible();
  await expect(
    ownerPage.getByRole("link", { name: work.title }),
  ).toHaveAttribute("href", `/book/${work.id}`);
  const ownerJournal = await (
    await ownerPage.request.get(`/api/library/${userBook.id}/journal?page=0`)
  ).json();
  expect(ownerJournal.marketplaceSaves).toHaveLength(0);
  expect(ownerJournal.marketplaceListings[0].id).toBe(listingId);

  for (const attempt of [1, 2]) {
    const deleted = await ownerPage.request.patch("/api/marketplace", {
      data: { action: "delete", listingId, version: 5 },
    });
    expect(deleted.status(), `delete attempt ${attempt}`).toBe(200);
  }
  const erased = await db.marketplaceListing.findUniqueOrThrow({
    where: { id: listingId },
  });
  expect(erased.deletedAt).not.toBeNull();
  expect(erased.title).toBe("");
  expect(erased.externalUrl).toBe("");
  expect(erased.workId).toBeNull();

  await readerContext.close();
  await moderatorContext.close();
  await ownerContext.close();
});
