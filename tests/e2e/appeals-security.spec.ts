import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "appeals-security-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function signIn(page: Page, email: string, secret = password) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: secret },
  });
}
async function login(page: Page, suffix: string) {
  const email = `appeals-security-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Private Account", email, password },
      })
    ).ok(),
  ).toBe(true);
  await signIn(page, email);
  return db.user.update({
    where: { email },
    data: {
      username: `a${stamp}${suffix}`,
      publicName: `Public ${suffix}`,
      profilePublic: true,
    },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `appeals-security-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Appeals ${stamp}` } },
  });
  await db.$disconnect();
});
test("private appeals reject stale decisions, restore with publication controls and retain history", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await login(mod, "moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const reader = await login(other, "reader");
  const review = await db.bookReview.create({
    data: {
      user: { connect: { id: owner.id } },
      body: "HIDDEN_REVIEW_BODY",
      isPublic: true,
      isHidden: true,
      work: {
        create: {
          title: `Appeals ${stamp} book`,
          authorName: "Author",
          genres: [],
          themes: [],
          embedding: [],
          editions: {
            create: {
              format: "paperback",
              userBooks: {
                create: { userId: owner.id, shelf: "read" as const },
              },
            },
          },
        },
      },
    },
  });
  const api = `/api/appeals/${review.workId}`;
  expect(
    (
      await other.request.post(api, {
        data: { reason: "Not the owner of this review", moderationVersion: 0 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post(api, {
        data: { reason: "short", moderationVersion: 0 },
      })
    ).status(),
  ).toBe(400);
  await page.goto("/community/reviews?status=hidden");
  await page
    .getByRole("button", { name: "Appeal restriction", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Appeal explanation", exact: true })
    .fill("PRIVATE_APPEAL_EXPLANATION");
  await page
    .getByRole("button", { name: "Submit appeal", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Appeal submitted");
  const appeal = await db.reviewAppeal.findFirstOrThrow({
    where: { userId: owner.id },
  });
  expect(
    (
      await page.request.post(api, {
        data: { reason: appeal.reason, moderationVersion: 0 },
      })
    ).ok(),
  ).toBe(true);
  expect(await db.reviewAppeal.count({ where: { userId: owner.id } })).toBe(1);
  await other.goto("/community/appeals");
  expect(await other.content()).not.toContain(appeal.reason);
  await other.goto("/community/moderation/appeals");
  expect(await other.content()).not.toContain(appeal.reason);
  expect(
    (
      await other.request.patch(`/api/moderation/appeals/${appeal.id}`, {
        data: {
          action: "restore",
          reviewId: review.id,
          reviewVersion: 1,
          response: "Unauthorized restore attempt",
        },
      })
    ).status(),
  ).toBe(403);
  await mod.goto("/community/moderation/appeals");
  await mod
    .getByRole("button", { name: "Lift restriction", exact: true })
    .click();
  await mod
    .getByRole("textbox", { name: "Explanation for the reader", exact: true })
    .fill("Approved after reviewing the explanation.");
  expect(
    (
      await page.request.put(`/api/reviews/${review.workId}`, {
        data: {
          body: "EDITED_DURING_APPEAL",
          rating: null,
          isPublic: true,
          version: 1,
        },
      })
    ).ok(),
  ).toBe(true);
  await mod
    .getByRole("button", { name: "Confirm decision", exact: true })
    .click();
  await expect(
    mod.getByRole("alert").filter({ hasText: "changed" }),
  ).toBeVisible();
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: review.id } }))
      .isHidden,
  ).toBe(true);
  await mod.getByRole("button", { name: "Close", exact: true }).click();
  await mod.reload();
  await mod
    .getByRole("button", { name: "Lift restriction", exact: true })
    .click();
  await mod
    .getByRole("textbox", { name: "Explanation for the reader", exact: true })
    .fill("Approved after reviewing the edited review.");
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: false },
  });
  await mod
    .getByRole("button", { name: "Confirm decision", exact: true })
    .click();
  await expect(mod.getByText(appeal.reason, { exact: true })).toHaveCount(0);
  expect((await other.request.get(`/review/${review.id}`)).status()).toBe(404);
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: review.id } }))
      .isHidden,
  ).toBe(false);
  await page.goto("/community/appeals");
  await expect(
    page.getByText("Status: restored", { exact: true }),
  ).toBeVisible();
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: true },
  });
  await other.goto(`/review/${review.id}`);
  await expect(
    other.getByText("EDITED_DURING_APPEAL", { exact: true }),
  ).toBeVisible();
  expect(await other.content()).not.toContain(appeal.reason);
  const report = await db.reviewReport.create({
    data: {
      reporterId: reader.id,
      reviewId: review.id,
      targetKey: `review:${review.id}`,
      reason: "other",
      details: "New decision",
      snapshot: "EDITED_DURING_APPEAL",
    },
  });
  expect(
    (
      await mod.request.patch(`/api/moderation/${report.id}`, {
        data: { action: "hide" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(api, {
        data: {
          reason: "Appealing the newer restriction",
          moderationVersion: 2,
        },
      })
    ).ok(),
  ).toBe(true);
  const pending = await db.reviewAppeal.findFirstOrThrow({
    where: { userId: owner.id, status: "pending" },
  });
  expect(
    (
      await page.request.delete(`/api/reviews/${review.workId}`, {
        data: { id: review.id, version: 2 },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await mod.request.patch(`/api/moderation/appeals/${pending.id}`, {
        data: {
          action: "restore",
          reviewId: review.id,
          reviewVersion: 3,
          response: "Restriction lifted; deleted review stays deleted.",
        },
      })
    ).ok(),
  ).toBe(true);
  expect((await other.request.get(`/review/${review.id}`)).status()).toBe(404);
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: review.id } })).body,
  ).toBe("");
  expect(
    (await db.reviewAppeal.findUniqueOrThrow({ where: { id: pending.id } }))
      .resolvedById,
  ).toBe(moderator.id);
  expect(
    (
      await page.request.put(`/api/reviews/${review.workId}`, {
        data: {
          body: "New review after deletion",
          rating: null,
          isPublic: true,
          version: 3,
        },
      })
    ).ok(),
  ).toBe(true);
  const fresh = await db.bookReview.findFirstOrThrow({
    where: { userId: owner.id, workId: review.workId, active: true },
  });
  const report2 = await db.reviewReport.create({
    data: {
      reporterId: reader.id,
      reviewId: fresh.id,
      targetKey: `review:${fresh.id}`,
      reason: "other",
      details: "Recheck",
      snapshot: fresh.body,
    },
  });
  await mod.request.patch(`/api/moderation/${report2.id}`, {
    data: { action: "hide" },
  });
  expect(
    (
      await page.request.post(api, {
        data: { reason: "First appeal for new review", moderationVersion: 4 },
      })
    ).ok(),
  ).toBe(true);
  const report3 = await db.reviewReport.create({
    data: {
      reporterId: owner.id,
      reviewId: fresh.id,
      targetKey: `review:${fresh.id}`,
      reason: "other",
      details: "Newer evidence",
      snapshot: fresh.body,
    },
  });
  await mod.request.patch(`/api/moderation/${report3.id}`, {
    data: { action: "hide" },
  });
  expect(
    await db.reviewAppeal.count({
      where: { userId: owner.id, status: "superseded" },
    }),
  ).toBe(1);
  expect(
    (
      await page.request.post(api, {
        data: {
          reason: "Old decision should be rejected",
          moderationVersion: 4,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post(api, {
        data: {
          reason: "Appeal for the latest decision",
          moderationVersion: 5,
        },
      })
    ).ok(),
  ).toBe(true);
  const finalAppeal = await db.reviewAppeal.findFirstOrThrow({
    where: { userId: owner.id, status: "pending" },
  });
  expect(
    (
      await mod.request.patch(`/api/moderation/appeals/${finalAppeal.id}`, {
        data: {
          action: "reject",
          reviewId: fresh.id,
          reviewVersion: 4,
          response: "Restriction remains after review of the latest evidence.",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: fresh.id } }))
      .isHidden,
  ).toBe(true);
  expect(
    (
      await page.request.post(api, {
        data: {
          reason: "Appeal for the latest decision",
          moderationVersion: 5,
        },
      })
    ).status(),
  ).toBe(409);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/community/appeals");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/appeals-mobile.png", fullPage: true });
  await modContext.close();
  await otherContext.close();
});
test("password changes and device sign-out revoke existing sessions without a login loop", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "security");
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, owner.email!);
  expect(
    (await (await other.request.get("/api/auth/session")).json()).user.id,
  ).toBe(owner.id);
  expect(
    (
      await page.request.post("/api/settings/security", {
        data: {
          action: "password",
          currentPassword: "wrong",
          newPassword: "replacement-password",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).authVersion,
  ).toBe(0);
  await page.goto("/settings");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill("replacement-password");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("replacement-password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm security change", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await other.request.post("/api/shelves", {
        data: { name: "Revoked session shelf" },
      })
    ).status(),
  ).toBe(401);
  await other.goto("/login");
  await expect(other).toHaveURL(/\/login$/);
  await expect(
    other.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await signIn(other, owner.email!, password);
  expect(
    await (await other.request.get("/api/auth/session")).json(),
  ).toBeNull();
  await signIn(page, owner.email!, "replacement-password");
  await signIn(other, owner.email!, "replacement-password");
  expect(
    (await (await other.request.get("/api/auth/session")).json()).user.id,
  ).toBe(owner.id);
  await page.goto("/settings");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("replacement-password");
  await page
    .getByRole("button", { name: "Sign out all devices", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm security change", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await other.request.post("/api/shelves", {
        data: { name: "Still revoked" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).authVersion,
  ).toBe(2);
  await signIn(other, owner.email!, "replacement-password");
  expect(
    (await (await other.request.get("/api/auth/session")).json()).user.id,
  ).toBe(owner.id);
  await otherContext.close();
});
