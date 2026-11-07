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

  const unpublished = await ownerPage.request.post("/api/marketplace", {
    data: {
      listingId,
      version: 1,
      listing: { ...listing, isPublished: false },
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
      data: { action: "delete", listingId, version: 2 },
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
  await ownerContext.close();
});
