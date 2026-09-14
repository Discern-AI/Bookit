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
