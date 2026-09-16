import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
const stamp = Date.now();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `review-management-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          name: "Private Account",
          email,
          password: "management-test-password",
        },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "management-test-password" },
  });
  return db.user.update({
    where: { email },
    data: {
      username: `m${stamp}${suffix}`,
      publicName: `Reader ${suffix}`,
      profilePublic: true,
    },
  });
}
async function makeReview(
  userId: string,
  suffix: string,
  isPublic = false,
  isHidden = false,
) {
  return db.bookReview.create({
    data: {
      user: { connect: { id: userId } },
      body: `PRIVATE_REVIEW_${suffix}_${stamp}`,
      isPublic,
      isHidden,
      rating: 4,
      work: {
        create: {
          title: `Management ${stamp} ${suffix}`,
          authorName: "Management Author",
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
                  rating: 2,
                  privateNotes: "KEEP_PRIVATE_NOTES",
                  importedReview: "KEEP_IMPORTED_REVIEW",
                },
              },
            },
          },
        },
      },
    },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `review-management-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Management ${stamp}` } },
  });
  await db.$disconnect();
});
test("private review dashboard filters, searches, paginates and resumes drafts", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "dashboard");
  const drafts = [];
  for (let i = 0; i < 21; i++)
    drafts.push(await makeReview(owner.id, `draft${i}`));
  const published = await makeReview(owner.id, "published", true);
  await makeReview(owner.id, "hidden", true, true);
  await page.goto("/community");
  await page.getByRole("link", { name: "Your reviews", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your reviews", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "drafts", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "drafts", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("article")).toHaveCount(20);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/status=drafts&page=2/);
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "published", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "published", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "View discussion", exact: true }),
  ).toHaveAttribute("href", `/review/${published.id}`);
  await page
    .getByRole("link", { name: "Moderator hidden", exact: true })
    .click();
  await expect(
    page.getByText("Hidden by a moderator", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View discussion", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "all", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "all", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("textbox", { name: "Search your reviews" })
    .fill(`Management ${stamp} draft20`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Edit review", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Review", exact: true }),
  ).toHaveValue(drafts[20].body);
  await page
    .getByRole("textbox", { name: "Review", exact: true })
    .fill("RESUMED_PRIVATE_DRAFT");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("link", { name: "Your reviews", exact: true }).click();
  await expect(
    page.getByText("RESUMED_PRIVATE_DRAFT", { exact: true }),
  ).toBeVisible();
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, "outsider");
  await other.goto("/community/reviews");
  await expect(other.locator("article")).toHaveCount(0);
  for (const path of [
    "/community",
    `/profile/${owner.username}`,
    `/book/${drafts[20].workId}`,
  ])
    expect(await (await other.request.get(path)).text()).not.toContain(
      "RESUMED_PRIVATE_DRAFT",
    );
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: false },
  });
  await page.goto("/community/reviews?status=published");
  await expect(
    page.getByText("Published - profile private", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View discussion", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/reviews-mobile.png", fullPage: true });
  await context.close();
});
test("review deletion preserves library and reports, rejects stale requests and creates a fresh discussion", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "deletion");
  const review = await makeReview(owner.id, "delete", true);
  const context = await browser.newContext();
  const other = await context.newPage();
  const reader = await login(other, "reader");
  const api = `/api/reviews/${review.workId}`;
  const deletion = { id: review.id, version: 1 };
  expect((await other.request.delete(api, { data: deletion })).status()).toBe(
    404,
  );
  expect((await page.request.delete(api, { data: {} })).status()).toBe(400);
  const anonymous = await browser.newContext();
  expect(
    (await anonymous.request.delete(api, { data: deletion })).status(),
  ).toBe(401);
  await other.request.put(`/api/review-discussions/${review.id}`);
  const comment = await db.reviewComment.create({
    data: {
      id: randomUUID(),
      reviewId: review.id,
      userId: reader.id,
      body: "OLD_DISCUSSION_COMMENT",
    },
  });
  expect(
    (
      await other.request.post(
        `/api/review-discussions/${review.id}?action=report`,
        { data: { reason: "other", details: "RETAIN_REPORT_EVIDENCE" } },
      )
    ).ok(),
  ).toBe(true);
  const report = await db.reviewReport.findFirstOrThrow({
    where: { reviewId: review.id },
  });
  await page.goto("/community/reviews");
  await page
    .getByRole("button", { name: "Delete review", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep review", exact: true }).click();
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: review.id } }))
      .deletedAt,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Delete review", exact: true })
    .click();
  expect(
    (
      await page.request.put(api, {
        data: {
          body: "NEWER_SAVED_REVIEW",
          rating: 5,
          isPublic: true,
          version: 1,
        },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: review.id } })).body,
  ).toBe("NEWER_SAVED_REVIEW");
  await page.getByRole("button", { name: "Keep review", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Delete review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(0);
  const tombstone = await db.bookReview.findUniqueOrThrow({
    where: { id: review.id },
  });
  expect(tombstone.body).toBe("");
  expect(tombstone.rating).toBeNull();
  expect(tombstone.deletedAt).not.toBeNull();
  expect(tombstone.active).toBeNull();
  expect(await db.reviewLike.count({ where: { reviewId: review.id } })).toBe(0);
  expect(
    (await db.reviewReport.findUniqueOrThrow({ where: { id: report.id } }))
      .snapshot,
  ).toBe(review.body);
  expect(
    (await db.reviewComment.findUniqueOrThrow({ where: { id: comment.id } }))
      .body,
  ).toBe(comment.body);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  expect(book.rating).toBe(2);
  expect(book.privateNotes).toBe("KEEP_PRIVATE_NOTES");
  expect(book.importedReview).toBe("KEEP_IMPORTED_REVIEW");
  expect((await other.request.get(`/review/${review.id}`)).status()).toBe(404);
  expect(
    (
      await page.request.put(api, {
        data: {
          body: "STALE_RESURRECTION",
          rating: 1,
          isPublic: true,
          version: 2,
        },
      })
    ).status(),
  ).toBe(409);
  await page.goto(`/community/review/${review.workId}`);
  await expect(
    page.getByRole("textbox", { name: "Review", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Review", exact: true })
    .fill("FRESH_REVIEW");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const fresh = await db.bookReview.findFirstOrThrow({
    where: { userId: owner.id, workId: review.workId, active: true },
  });
  expect(fresh.id).not.toBe(review.id);
  expect(fresh.version).toBe(4);
  expect(fresh.isPublic).toBe(false);
  expect(
    (
      await page.request.delete(api, { data: { id: review.id, version: 2 } })
    ).ok(),
  ).toBe(true);
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: fresh.id } })).active,
  ).toBe(true);
  expect(
    (
      await page.request.put(api, {
        data: { body: fresh.body, rating: 4, isPublic: true, version: 4 },
      })
    ).ok(),
  ).toBe(true);
  await other.goto(`/review/${fresh.id}`);
  await expect(other.getByText("FRESH_REVIEW", { exact: true })).toBeVisible();
  await expect(
    other.getByText("OLD_DISCUSSION_COMMENT", { exact: true }),
  ).toHaveCount(0);
  expect((await other.request.get(`/review/${review.id}`)).status()).toBe(404);
  await db.user.update({
    where: { id: reader.id },
    data: { isModerator: true },
  });
  expect(
    (
      await other.request.patch(`/api/moderation/${report.id}`, {
        data: { action: "hide" },
      })
    ).ok(),
  ).toBe(true);
  expect((await other.request.get(`/review/${fresh.id}`)).status()).toBe(404);
  expect(
    (await db.bookReview.findUniqueOrThrow({ where: { id: fresh.id } }))
      .isHidden,
  ).toBe(true);
  expect(
    (
      await page.request.delete(api, { data: { id: fresh.id, version: 5 } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.put(api, {
        data: {
          body: "NO_MODERATION_BYPASS",
          rating: 4,
          isPublic: true,
          version: 6,
        },
      })
    ).ok(),
  ).toBe(true);
  const replacement = await db.bookReview.findFirstOrThrow({
    where: { userId: owner.id, workId: review.workId, active: true },
  });
  expect(replacement.isHidden).toBe(true);
  expect((await other.request.get(`/review/${replacement.id}`)).status()).toBe(
    404,
  );
  await other.goto("/community/comments");
  await expect(
    other.getByText("OLD_DISCUSSION_COMMENT", { exact: true }),
  ).toBeVisible();
  await other
    .getByRole("button", { name: "Remove comment", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(
    other.getByText("OLD_DISCUSSION_COMMENT", { exact: true }),
  ).toHaveCount(0);
  await context.close();
  await anonymous.close();
});
