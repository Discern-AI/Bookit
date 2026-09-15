import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `shelf-sharing-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          name: "PRIVATE_ACCOUNT_NAME",
          email,
          password: "shelf-sharing-password",
        },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "shelf-sharing-password" },
  });
  return db.user.update({
    where: { email },
    data: { username: `s${stamp}${suffix}`, publicName: "Public Reader" },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `shelf-sharing-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Shelf ${stamp}` } },
  });
  await db.$disconnect();
});
test("opt-in live shelves protect private fields, profile visibility and stale sharing", async ({
  page,
  browser,
}) => {
  const user = await login(page, "owner");
  const shelf = await db.customShelf.create({
    data: { userId: user.id, name: "Shared favourites" },
  });
  const privateShelf = await db.customShelf.create({
    data: { userId: user.id, name: "PRIVATE_SHELF_NAME" },
  });
  const books = [];
  for (let i = 0; i < 21; i++) {
    const work = await db.work.create({
      data: {
        title: `Shelf ${stamp} book ${i}`,
        authorName: "Shelf Author",
        genres: [],
        themes: [],
        embedding: [],
        editions: {
          create: {
            format: "paperback",
            publisher: "Public Publisher",
            userBooks: {
              create: {
                userId: user.id,
                shelf: "read",
                rating: 1.5,
                privateNotes: "PRIVATE_NOTES_SENTINEL",
                importedReview: "PRIVATE_IMPORTED_REVIEW",
                customShelves: {
                  connect: [{ id: shelf.id }, { id: privateShelf.id }],
                },
              },
            },
          },
        },
      },
      include: { editions: { include: { userBooks: true } } },
    });
    books.push(work);
  }
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "other");
  const anonymous = await browser.newContext();
  const guest = await anonymous.newPage();
  const api = `/api/shelves/${shelf.id}/sharing`;
  expect((await guest.request.get(`/shelf/${shelf.id}`)).status()).toBe(404);
  expect(
    (
      await guest.request.put(api, { data: { isPublic: true, version: 0 } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await other.request.put(api, { data: { isPublic: true, version: 0 } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.put(api, { data: { isPublic: true, version: 0 } })
    ).status(),
  ).toBe(400);
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: true },
  });
  await page.goto("/settings/shelves");
  const card = page.locator("article").filter({ hasText: "Shared favourites" });
  await card.getByRole("button", { name: "Share shelf", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(
    (await db.customShelf.findUniqueOrThrow({ where: { id: shelf.id } }))
      .isPublic,
  ).toBe(false);
  await card.getByRole("button", { name: "Share shelf", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm publish", exact: true })
    .click();
  await expect(
    card.getByRole("link", { name: "View public shelf", exact: true }),
  ).toBeVisible();
  await guest.goto(`/shelf/${shelf.id}`);
  await expect(guest.locator("article")).toHaveCount(20);
  const html = await guest.content();
  for (const secret of [
    user.id,
    user.email!,
    books[0].editions[0].userBooks[0].id,
    "PRIVATE_ACCOUNT_NAME",
    "PRIVATE_NOTES_SENTINEL",
    "PRIVATE_IMPORTED_REVIEW",
    "PRIVATE_SHELF_NAME",
  ])
    expect(html).not.toContain(secret);
  await guest.getByRole("link", { name: "Next", exact: true }).click();
  await expect(guest.locator("article")).toHaveCount(1);
  await guest.goto(`/profile/${user.username}?tab=shelves`);
  await expect(
    guest.getByRole("link", { name: "Shared favourites", exact: true }),
  ).toBeVisible();
  expect(await guest.content()).not.toContain(privateShelf.name);
  await page.request.patch(
    `/api/library/${books[0].editions[0].userBooks[0].id}`,
    { data: { customShelfIds: [privateShelf.id] } },
  );
  await guest.goto(`/shelf/${shelf.id}`);
  await expect(
    guest.getByRole("link", { name: books[0].title, exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings/shelves");
  await card.getByRole("button", { name: "Stop sharing", exact: true }).click();
  expect(
    (
      await page.request.patch(`/api/shelves/${shelf.id}`, {
        data: { name: "Renamed public shelf" },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Confirm stop sharing", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: false },
  });
  expect((await guest.request.get(`/shelf/${shelf.id}`)).status()).toBe(404);
  await page.reload();
  await expect(
    page.getByText("Shared - profile private", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm stop sharing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop sharing", exact: true }),
  ).toHaveCount(0);
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: true },
  });
  expect((await guest.request.get(`/shelf/${shelf.id}`)).status()).toBe(404);
  const current = await db.customShelf.findUniqueOrThrow({
    where: { id: shelf.id },
  });
  expect(
    (
      await page.request.put(api, {
        data: { isPublic: true, version: current.shareVersion },
      })
    ).ok(),
  ).toBe(true);
  expect((await page.request.delete(`/api/shelves/${shelf.id}`)).ok()).toBe(
    true,
  );
  expect((await guest.request.get(`/shelf/${shelf.id}`)).status()).toBe(404);
  expect(await db.userBook.count({ where: { userId: user.id } })).toBe(21);
  await otherContext.close();
  await anonymous.close();
});
test("profile collection tabs paginate public shelves and paths without exposing private collections", async ({
  page,
  browser,
}) => {
  const user = await login(page, "tabs");
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: true },
  });
  await db.customShelf.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      userId: user.id,
      name: `Collection ${i}`,
      isPublic: i < 21,
    })),
  });
  await db.readingPath.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      userId: user.id,
      title: `Path ${i}`,
      description: i === 21 ? "PRIVATE_PATH_DESCRIPTION" : "Published journey",
      isPublic: i < 21,
    })),
  });
  const anonymous = await browser.newContext();
  const guest = await anonymous.newPage();
  await guest.goto(`/profile/${user.username}?tab=shelves`);
  await expect(guest.locator("article")).toHaveCount(20);
  await guest.getByRole("link", { name: "Next", exact: true }).click();
  await expect(guest).toHaveURL(/tab=shelves&page=2/);
  await expect(guest.locator("article")).toHaveCount(1);
  await guest.getByRole("link", { name: "Reading paths", exact: true }).click();
  await expect(guest.locator("article")).toHaveCount(20);
  expect(await guest.content()).not.toContain("PRIVATE_PATH_DESCRIPTION");
  expect(await guest.content()).not.toContain("PRIVATE_ACCOUNT_NAME");
  await guest.getByRole("link", { name: "Next", exact: true }).click();
  await expect(guest).toHaveURL(/tab=paths&page=2/);
  await expect(guest.locator("article")).toHaveCount(1);
  await guest.getByRole("link", { name: "Reviews", exact: true }).click();
  await expect(
    guest.getByRole("heading", { name: "Published reviews", exact: true }),
  ).toBeVisible();
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto(`/profile/${user.username}?tab=shelves`);
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await guest.screenshot({
    path: ".local/profile-shelves-mobile.png",
    fullPage: true,
  });
  await anonymous.close();
});
