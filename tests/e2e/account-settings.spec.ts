import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "account-settings-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `account-settings-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `account-settings-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Account ${stamp}` } },
  });
  await db.$disconnect();
});

test("private name edits and confirmed account deletion preserve other readers", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  const other = await login(await browser.newPage(), "other");
  const work = await add(owner.id, `Account ${stamp} Shared book`);
  const saved = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const readingCycle = await db.readingCycle.create({
    data: { userBookId: saved.id, number: 1 },
  });
  await db.userBook.create({
    data: {
      userId: other.id,
      editionId: saved.editionId,
      shelf: "tbr",
    },
  });
  await db.readingSession.create({
    data: { userId: owner.id, userBookId: saved.id, pageStart: 0, pageEnd: 20 },
  });
  const article = await db.article.create({
    data: {
      id: `account-${stamp}`,
      userId: owner.id,
      title: "Private article",
      content: { type: "doc", content: [] },
    },
  });
  const articleImage = await db.articleImage.create({
    data: { articleId: article.id, data: Buffer.from("fixture") },
  });
  const contact = await db.giftContact.create({
    data: { userId: other.id, name: "Other reader's list" },
  });
  const gift = await db.giftItem.create({
    data: {
      contactId: contact.id,
      workId: work.id,
      claimedById: owner.id,
      claimedAt: new Date(),
      claimVersion: 2,
    },
  });
  const second = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  await page.goto("/settings");
  await page
    .getByRole("textbox", { name: "Private account name", exact: true })
    .fill("Updated private name");
  await page
    .getByRole("button", { name: "Save account name", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Account name saved." }),
  ).toBeVisible();
  const updated = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  expect(updated.name).toBe("Updated private name");
  expect(updated.publicName).toBe(owner.publicName);
  expect(
    (await (await page.request.get("/api/auth/session")).json()).user.name,
  ).toBe("Updated private name");
  expect(
    (
      await page.request.post("/api/settings/account", {
        data: { action: "name", name: "", userId: other.id },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/settings/account", {
        headers: { origin: "https://other.example" },
        data: {
          action: "delete",
          currentPassword: password,
          confirmation: "DELETE",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/settings/account", {
        data: {
          action: "delete",
          currentPassword: password,
          confirmation: "delete",
        },
      })
    ).status(),
  ).toBe(400);
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Permanently delete account",
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(await db.user.count({ where: { id: owner.id } })).toBe(1);
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await dialog
    .getByLabel("Password for account deletion", { exact: true })
    .fill("wrong-password");
  await dialog
    .getByRole("textbox", { name: "Type DELETE", exact: true })
    .fill("DELETE");
  await dialog
    .getByRole("button", { name: "Permanently delete my account", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Current password is incorrect.",
  );
  expect(await db.user.count({ where: { id: owner.id } })).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/account-deletion-mobile.png" });
  await page.evaluate((id) => {
    localStorage.setItem(
      `folio:article-recovery:${id}:new`,
      "PRIVATE_RECOVERY",
    );
    localStorage.setItem(`folio:article-recovery-enabled:${id}`, "yes");
    localStorage.setItem("folio:article-recovery:another-user:new", "KEEP");
  }, owner.id);
  await dialog
    .getByLabel("Password for account deletion", { exact: true })
    .fill(password);
  await dialog
    .getByRole("button", { name: "Permanently delete my account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  expect(await db.user.count({ where: { id: owner.id } })).toBe(0);
  expect(await db.readingCycle.count({ where: { id: readingCycle.id } })).toBe(
    0,
  );
  expect(await db.userBook.count({ where: { userId: owner.id } })).toBe(0);
  expect(await db.readingSession.count({ where: { userId: owner.id } })).toBe(
    0,
  );
  expect(await db.articleImage.count({ where: { id: articleImage.id } })).toBe(
    0,
  );
  expect(await db.article.count({ where: { id: article.id } })).toBe(0);
  expect(await db.user.count({ where: { id: other.id } })).toBe(1);
  expect(
    await db.userBook.count({
      where: { userId: other.id, editionId: saved.editionId },
    }),
  ).toBe(1);
  expect(await db.work.count({ where: { id: work.id } })).toBe(1);
  const released = await db.giftItem.findUniqueOrThrow({
    where: { id: gift.id },
  });
  expect(
    (await db.giftContact.findUniqueOrThrow({ where: { id: contact.id } }))
      .version,
  ).toBe(contact.version + 1);
  expect(released.claimedById).toBeNull();
  expect(released.claimedAt).toBeNull();
  expect(released.claimVersion).toBe(3);
  expect(
    await page.evaluate(
      (id) => localStorage.getItem(`folio:article-recovery:${id}:new`),
      owner.id,
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("folio:article-recovery:another-user:new"),
    ),
  ).toBe("KEEP");
  expect(
    (
      await second.request.post("/api/settings/account", {
        data: { action: "name", name: "Revived" },
      })
    ).status(),
  ).toBe(401);
  expect(
    await (await second.request.get("/api/auth/session")).json(),
  ).toBeNull();
  await second.close();
});
