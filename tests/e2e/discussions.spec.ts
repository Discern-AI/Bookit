import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
const stamp = Date.now();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string, profilePublic = true) {
  const email = `discussion-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          isModerator: true,
          name: "PRIVATE_ACCOUNT_SENTINEL",
          email,
          password: "discussion-test-password",
        },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "discussion-test-password" },
  });
  return await db.user.update({
    where: { email },
    data: {
      username: `d${stamp}${suffix}`,
      publicName: `Public ${suffix}`,
      profilePublic,
    },
  });
}
async function makeReview(userId: string, suffix: string) {
  return db.bookReview.create({
    data: {
      user: { connect: { id: userId } },
      body: `REVIEW_${suffix}_${stamp}`,
      isPublic: true,
      work: {
        create: {
          title: `Discussion ${stamp} ${suffix}`,
          authorName: "Author",
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
                  privateNotes: "PRIVATE_NOTES_SENTINEL",
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
    where: { email: { startsWith: `discussion-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Discussion ${stamp}` } },
  });
  await db.$disconnect();
});
test("likes and public comments preserve privacy, retries, pagination and author removal", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  const review = await makeReview(owner.id, "discussion");
  const context = await browser.newContext();
  const writer = await context.newPage();
  const user = await login(writer, "writer", false);
  const anonymous = await browser.newContext();
  const guest = await anonymous.newPage();
  const api = `/api/review-discussions/${review.id}`;
  expect((await guest.request.put(api)).status()).toBe(401);
  expect(
    (
      await guest.request.post(api, {
        data: { id: randomUUID(), body: "Unauthorized" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await writer.request.post(api, {
        data: { id: randomUUID(), body: "Private profile" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await writer.request.post(api, { data: { id: randomUUID(), body: " " } })
    ).status(),
  ).toBe(400);
  await writer.goto(`/review/${review.id}`);
  await writer.getByRole("button", { name: "Like (0)", exact: true }).click();
  await expect(
    writer.getByRole("button", { name: "Unlike (1)", exact: true }),
  ).toBeVisible();
  for (const result of await Promise.all([
    writer.request.put(api),
    writer.request.put(api),
  ]))
    expect(result.ok()).toBe(true);
  expect(await db.reviewLike.count({ where: { reviewId: review.id } })).toBe(1);
  await writer.getByRole("button", { name: "Unlike (1)", exact: true }).click();
  await expect(
    writer.getByRole("button", { name: "Like (0)", exact: true }),
  ).toBeVisible();
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: true },
  });
  await writer.reload();
  await writer
    .getByRole("textbox", { name: "Public comment", exact: true })
    .fill("PUBLIC_COMMENT_SENTINEL");
  await writer.route(
    `**${api}`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Comment service unavailable. Try again.",
        }),
      }),
    { times: 1 },
  );
  await writer.getByRole("button", { name: "Post comment" }).click();
  await expect(
    writer
      .getByRole("alert")
      .filter({ hasText: "Comment service unavailable" }),
  ).toBeVisible();
  await expect(
    writer.getByRole("textbox", { name: "Public comment", exact: true }),
  ).toHaveValue("PUBLIC_COMMENT_SENTINEL");
  await writer.getByRole("button", { name: "Post comment" }).click();
  await expect(
    writer
      .locator("article")
      .getByText("PUBLIC_COMMENT_SENTINEL", { exact: true }),
  ).toBeVisible();
  const comment = await db.reviewComment.findFirstOrThrow({
    where: { reviewId: review.id },
  });
  for (const result of await Promise.all([
    writer.request.post(api, { data: { id: comment.id, body: comment.body } }),
    writer.request.post(api, { data: { id: comment.id, body: comment.body } }),
  ]))
    expect(result.ok()).toBe(true);
  expect(await db.reviewComment.count({ where: { reviewId: review.id } })).toBe(
    1,
  );
  expect(
    (await page.request.delete(`/api/review-comments/${comment.id}`)).status(),
  ).toBe(404);
  await guest.goto(`/review/${review.id}`);
  await expect(guest.getByText(comment.body, { exact: true })).toBeVisible();
  for (const secret of [
    user.id,
    user.email!,
    "PRIVATE_ACCOUNT_SENTINEL",
    "PRIVATE_NOTES_SENTINEL",
  ])
    expect(await guest.content()).not.toContain(secret);
  await writer
    .getByRole("button", { name: "Remove comment", exact: true })
    .click();
  await writer.getByRole("button", { name: "Confirm removal" }).click();
  await expect(writer.getByText(comment.body, { exact: true })).toHaveCount(0);
  expect(
    (await writer.request.delete(`/api/review-comments/${comment.id}`)).ok(),
  ).toBe(true);
  await db.reviewComment.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      id: randomUUID(),
      reviewId: review.id,
      userId: user.id,
      body: `PAGED_COMMENT_${i}`,
    })),
  });
  await guest.reload();
  await expect(guest.locator("article")).toHaveCount(21);
  await guest.getByRole("link", { name: "Next", exact: true }).click();
  await expect(guest.locator("article")).toHaveCount(2);
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: false },
  });
  await guest.goto(`/review/${review.id}`);
  await expect(guest.locator("article")).toHaveCount(1);
  expect(await guest.content()).not.toContain("Public writer");
  await db.bookReview.update({
    where: { id: review.id },
    data: { isPublic: false },
  });
  expect((await guest.request.get(`/review/${review.id}`)).status()).toBe(404);
  expect((await writer.request.put(api)).status()).toBe(404);
  expect(
    (
      await writer.request.post(`${api}?action=report`, {
        data: { reason: "spam", details: "hidden" },
      })
    ).status(),
  ).toBe(404);
  await writer.goto("/community/comments");
  await expect(
    writer.getByText("Review no longer public", { exact: true }),
  ).toHaveCount(20);
  await writer
    .getByRole("button", { name: "Remove comment", exact: true })
    .first()
    .click();
  await writer.getByRole("button", { name: "Confirm removal" }).click();
  await expect(writer.getByRole("dialog")).toHaveCount(0);
  await context.close();
  await anonymous.close();
});
test("private reports support moderator dismissal and hiding without author override", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "reportowner");
  expect(owner.isModerator).toBe(false);
  expect(
    (
      await page.request.put("/api/profile", {
        data: {
          username: owner.username,
          publicName: owner.publicName,
          bio: "",
          profilePublic: true,
          version: 0,
          isModerator: true,
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).isModerator,
  ).toBe(false);
  const review = await makeReview(owner.id, "moderation");
  const context = await browser.newContext();
  const reporter = await context.newPage();
  const user = await login(reporter, "reporter");
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await login(mod, "moderator");
  await db.user.update({
    where: { id: moderator.id },
    data: { isModerator: true },
  });
  const api = `/api/review-discussions/${review.id}`;
  const comment = await db.reviewComment.create({
    data: {
      id: randomUUID(),
      reviewId: review.id,
      userId: owner.id,
      body: "REPORTED_COMMENT_SNAPSHOT",
    },
  });
  await reporter.goto(`/review/${review.id}`);
  await reporter
    .getByRole("button", { name: "Report comment", exact: true })
    .click();
  await reporter
    .getByLabel("Details (optional)")
    .fill("PRIVATE_REPORT_DETAILS");
  await reporter.getByRole("button", { name: "Submit report" }).click();
  await expect(reporter.getByRole("status")).toContainText(
    "Report recorded privately",
  );
  const report = await db.reviewReport.findFirstOrThrow({
    where: { reporterId: user.id, commentId: comment.id },
  });
  expect(report.snapshot).toBe(comment.body);
  expect(
    (
      await reporter.request.post(`${api}?action=report`, {
        data: { commentId: comment.id, reason: "spam", details: "retry" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    await db.reviewReport.count({
      where: { reporterId: user.id, commentId: comment.id },
    }),
  ).toBe(1);
  expect(
    (
      await page.request.patch(`/api/moderation/${report.id}`, {
        data: { action: "hide" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/community/moderation");
  expect(await page.content()).not.toContain("PRIVATE_REPORT_DETAILS");
  await mod.goto("/community/moderation");
  await expect(
    mod.getByText("PRIVATE_REPORT_DETAILS", { exact: true }),
  ).toBeVisible();
  await mod.getByRole("button", { name: "Hide content", exact: true }).click();
  await mod.getByRole("button", { name: "Confirm hide", exact: true }).click();
  await expect(
    mod.getByText("PRIVATE_REPORT_DETAILS", { exact: true }),
  ).toHaveCount(0);
  await reporter.reload();
  await expect(reporter.getByText(comment.body, { exact: true })).toHaveCount(
    0,
  );
  expect(
    (
      await mod.request.patch(`/api/moderation/${report.id}`, {
        data: { action: "dismiss" },
      })
    ).status(),
  ).toBe(409);
  await reporter
    .getByRole("button", { name: "Report review", exact: true })
    .click();
  await reporter
    .getByRole("combobox", { name: "Reason", exact: true })
    .selectOption("other");
  await reporter.getByLabel("Details (optional)").fill("PRIVATE_REVIEW_REPORT");
  await reporter.getByRole("button", { name: "Submit report" }).click();
  await expect(reporter.getByRole("status")).toContainText(
    "Report recorded privately",
  );
  await mod.goto("/community/moderation");
  await mod
    .getByRole("button", { name: "Dismiss report", exact: true })
    .click();
  await expect(
    mod.getByText("PRIVATE_REVIEW_REPORT", { exact: true }),
  ).toHaveCount(0);
  await reporter.reload();
  await expect(reporter.getByText(review.body, { exact: true })).toBeVisible();
  expect(
    (
      await page.request.post(`${api}?action=report`, {
        data: { reason: "other", details: "SECOND_REPORT" },
      })
    ).ok(),
  ).toBe(true);
  await mod.reload();
  await mod.getByRole("button", { name: "Hide content", exact: true }).click();
  await mod.getByRole("button", { name: "Confirm hide", exact: true }).click();
  await expect(mod.getByText("SECOND_REPORT", { exact: true })).toHaveCount(0);
  expect((await reporter.request.get(`/review/${review.id}`)).status()).toBe(
    404,
  );
  expect((await reporter.request.put(api)).status()).toBe(404);
  expect(
    (
      await reporter.request.post(api, {
        data: { id: randomUUID(), body: "Hidden review comment" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.put(`/api/reviews/${review.workId}`, {
        data: {
          body: "EDITED_HIDDEN_REVIEW",
          rating: null,
          isPublic: true,
          version: 1,
        },
      })
    ).ok(),
  ).toBe(true);
  expect((await reporter.request.get(`/review/${review.id}`)).status()).toBe(
    404,
  );
  for (const path of [
    "/community",
    `/book/${review.workId}`,
    `/profile/${owner.username}`,
  ])
    expect(await (await reporter.request.get(path)).text()).not.toContain(
      "EDITED_HIDDEN_REVIEW",
    );
  await mod.goto("/community/moderation?status=resolved");
  await expect(
    mod.getByText("PRIVATE_REVIEW_REPORT", { exact: true }),
  ).toBeVisible();
  expect(
    (await db.reviewReport.findUniqueOrThrow({ where: { id: report.id } }))
      .resolvedById,
  ).toBe(moderator.id);
  await mod.setViewportSize({ width: 390, height: 844 });
  expect(
    await mod.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await mod.screenshot({
    path: ".local/moderation-mobile.png",
    fullPage: true,
  });
  await context.close();
  await modContext.close();
});
