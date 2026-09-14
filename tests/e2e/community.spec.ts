import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `community-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          name: "PRIVATE_ACCOUNT_NAME",
          email,
          password: "community-test-password",
        },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "community-test-password" },
  });
  return (await db.user.findUniqueOrThrow({ where: { email } })).id;
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `community-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Community ${stamp}` } },
  });
  await db.$disconnect();
});
test("explicit publishing, privacy, withdrawal and stale draft protection", async ({
  page,
  browser,
}) => {
  const userId = await login(page, "owner");
  const work = await db.work.create({
    data: {
      title: `Community ${stamp} book`,
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
              rating: 1,
              privateNotes: "PRIVATE_NOTE_SENTINEL",
              importedReview: "PRIVATE_IMPORT_SENTINEL",
            },
          },
        },
      },
    },
  });
  const anonymous = await browser.newContext();
  const guest = await anonymous.newPage();
  const username = `reader${stamp}`;
  const profile = {
    username,
    publicName: "Public Reader",
    bio: "Public bio",
    profilePublic: false,
    version: 0,
  };
  expect(
    (await guest.request.put("/api/profile", { data: profile })).status(),
  ).toBe(401);
  expect((await page.request.put("/api/profile", { data: profile })).ok()).toBe(
    true,
  );
  expect((await guest.request.get(`/profile/${username}`)).status()).toBe(404);
  const draft = {
    body: "PUBLIC_REVIEW_SENTINEL",
    rating: 5,
    isPublic: false,
    version: 0,
  };
  expect(
    (
      await page.request.put(`/api/reviews/${work.id}`, {
        data: { ...draft, isPublic: true },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await page.request.put(`/api/reviews/${work.id}`, { data: draft })).ok(),
  ).toBe(true);
  expect(
    await (await guest.request.get(`/book/${work.id}`)).text(),
  ).not.toContain(draft.body);
  await page.goto("/settings/profile");
  await page.getByLabel("Publish my profile.", { exact: false }).check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(`/community/review/${work.id}`);
  await page.getByLabel("Publish this review", { exact: false }).check();
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await guest.goto(`/profile/${username}`);
  await expect(guest.getByText(draft.body, { exact: true })).toBeVisible();
  const html = await guest.content();
  for (const secret of [
    "PRIVATE_ACCOUNT_NAME",
    "PRIVATE_NOTE_SENTINEL",
    "PRIVATE_IMPORT_SENTINEL",
    userId,
  ])
    expect(html).not.toContain(secret);
  await guest.goto(`/book/${work.id}`);
  await expect(guest.getByText(draft.body, { exact: true })).toBeVisible();
  await expect(guest.getByLabel("Rating: 5 out of 5")).toBeVisible();
  await page.goto("/community");
  await expect(page.getByText(draft.body, { exact: true })).toBeVisible();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "other");
  expect(
    (
      await other.request.put(`/api/reviews/${work.id}`, { data: draft })
    ).status(),
  ).toBe(403);
  expect(
    (await other.request.put("/api/profile", { data: profile })).status(),
  ).toBe(409);
  await page.goto(`/community/review/${work.id}`);
  await page
    .getByRole("textbox", { name: "Review", exact: true })
    .fill("UNSAVED_DRAFT_SENTINEL");
  expect(
    (
      await page.request.put(`/api/reviews/${work.id}`, {
        data: { ...draft, version: 2, isPublic: false },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByRole("status")).toContainText("changed elsewhere");
  await expect(
    page.getByRole("textbox", { name: "Review", exact: true }),
  ).toHaveValue("UNSAVED_DRAFT_SENTINEL");
  expect(
    await (await guest.request.get(`/book/${work.id}`)).text(),
  ).not.toContain(draft.body);
  expect(
    (
      await page.request.put(`/api/reviews/${work.id}`, {
        data: { ...draft, version: 3, isPublic: true },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.put("/api/profile", {
        data: { ...profile, version: 2 },
      })
    ).ok(),
  ).toBe(true);
  expect((await guest.request.get(`/profile/${username}`)).status()).toBe(404);
  expect(
    await (await guest.request.get(`/book/${work.id}`)).text(),
  ).not.toContain(draft.body);
  const saved = await db.userBook.findFirstOrThrow({ where: { userId } });
  expect(saved.rating).toBe(1);
  expect(saved.importedReview).toBe("PRIVATE_IMPORT_SENTINEL");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/profile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/community-mobile.png",
    fullPage: true,
  });
  await anonymous.close();
  await otherContext.close();
});

test("reader follows filter and paginate reviews, preserve privacy and recover from failures", async ({
  page,
  browser,
}) => {
  const followerId = await login(page, "follower");
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  const readerId = await login(reader, "writer");
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  const outsiderId = await login(outsider, "outsider");
  const username = `writer${stamp}`;
  await db.user.update({
    where: { id: readerId },
    data: {
      username,
      publicName: "Followed Writer",
      bio: "HIDDEN_BIO_SENTINEL",
      profilePublic: true,
    },
  });
  await db.user.update({
    where: { id: outsiderId },
    data: {
      username: `outsider${stamp}`,
      publicName: "Other Writer",
      profilePublic: true,
    },
  });
  for (let index = 0; index < 22; index++)
    await db.work.create({
      data: {
        title: `Community ${stamp} follow ${index}`,
        authorName: "Author",
        genres: [],
        themes: [],
        embedding: [],
        reviews: {
          create: {
            userId: readerId,
            body: `FOLLOWED_REVIEW_${index}`,
            isPublic: index !== 21,
          },
        },
      },
    });
  await db.work.create({
    data: {
      title: `Community ${stamp} unrelated`,
      authorName: "Author",
      genres: [],
      themes: [],
      embedding: [],
      reviews: {
        create: {
          userId: outsiderId,
          body: "UNFOLLOWED_REVIEW_SENTINEL",
          isPublic: true,
        },
      },
    },
  });
  const anonymous = await browser.newContext();
  const guest = await anonymous.newPage();
  const url = `/api/readers/${readerId}/follow`;
  expect((await guest.request.put(url)).status()).toBe(401);
  expect(
    (await page.request.put(`/api/readers/${followerId}/follow`)).status(),
  ).toBe(400);
  expect(
    (await page.request.put("/api/readers/missing-reader/follow")).status(),
  ).toBe(404);
  await page.goto("/community?feed=following");
  await expect(
    page.getByText("No published reviews from readers you follow yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto(`/profile/${username}`);
  await page.route(
    `**${url}`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary follow failure. Try again." }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Follow reader", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary follow failure" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Follow reader", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Follow reader", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unfollow", exact: true }),
  ).toBeVisible();
  const retries = await Promise.all([
    page.request.put(url),
    page.request.put(url),
  ]);
  for (const response of retries) expect(response.ok()).toBe(true);
  expect(await db.readerFollow.count({ where: { followerId, readerId } })).toBe(
    1,
  );
  await guest.goto(`/profile/${username}`);
  await expect(
    guest.getByText("0 public followers", { exact: false }),
  ).toBeVisible();
  expect(await guest.content()).not.toContain(followerId);
  await db.user.update({
    where: { id: followerId },
    data: {
      username: `follower${stamp}`,
      publicName: "Public Follower",
      profilePublic: true,
    },
  });
  await guest.reload();
  await expect(
    guest.getByText("1 public followers", { exact: false }),
  ).toBeVisible();
  await db.user.update({
    where: { id: followerId },
    data: { profilePublic: false },
  });
  await guest.reload();
  await expect(
    guest.getByText("0 public followers", { exact: false }),
  ).toBeVisible();
  await page.goto("/community?feed=following");
  await expect(page.locator("article")).toHaveCount(20);
  await expect(
    page.getByText("UNFOLLOWED_REVIEW_SENTINEL", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("FOLLOWED_REVIEW_21", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/feed=following&page=2/);
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(20);
  await outsider.goto("/community?feed=following");
  await expect(outsider.locator("article")).toHaveCount(0);
  expect((await outsider.request.delete(url)).ok()).toBe(true);
  expect(await db.readerFollow.count({ where: { followerId, readerId } })).toBe(
    1,
  );
  expect(
    (
      await reader.request.put("/api/profile", {
        data: {
          username,
          publicName: "Followed Writer",
          bio: "HIDDEN_BIO_SENTINEL",
          profilePublic: false,
          version: 0,
        },
      })
    ).ok(),
  ).toBe(true);
  expect((await page.request.put(url)).status()).toBe(404);
  await page.goto("/community?feed=following");
  await expect(page.locator("article")).toHaveCount(0);
  await page.goto("/community/following");
  await expect(
    page.getByText("Private profile", { exact: true }),
  ).toBeVisible();
  const hidden = await page.content();
  expect(hidden).not.toContain("Followed Writer");
  expect(hidden).not.toContain("HIDDEN_BIO_SENTINEL");
  expect(hidden).not.toContain(username);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/following-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Unfollow", exact: true }).click();
  await expect(page.getByText("Private profile", { exact: true })).toHaveCount(
    0,
  );
  expect((await page.request.delete(url)).ok()).toBe(true);
  expect(await db.readerFollow.count({ where: { followerId, readerId } })).toBe(
    0,
  );
  await anonymous.close();
  await readerContext.close();
  await outsiderContext.close();
});
