import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "curator-shop-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `curator-shop-${stamp}-${suffix}@example.test`;
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
      username: `sh${stamp}${suffix}`,
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
    where: { email: { startsWith: `curator-shop-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Shop ${stamp}` } },
  });
  await db.$disconnect();
});

test("curator shops publish explicitly with private journals and revocation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const user = await login(page, "owner"),
    first = await add(user.id, `Shop ${stamp} First`),
    second = await add(user.id, `Shop ${stamp} Second`);
  const copy = await db.userBook.findFirstOrThrow({
    where: { userId: user.id, edition: { workId: first.id } },
  });
  const other = await browser.newContext(),
    visitor = await other.newPage();
  const publicUrl = `/shop/${user.username}`;
  await page.goto("/creator/shop");
  const editor = page.getByRole("form", { name: "Shop editor" });
  await page
    .getByLabel("Shop title", { exact: true })
    .fill("My carefully chosen books");
  await page
    .getByLabel("Shop introduction", { exact: true })
    .fill("A public introduction I chose to write.");
  await page
    .getByRole("button", { name: `Add ${first.title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `Add ${second.title}`, exact: true })
    .click();
  await page
    .getByLabel(`Recommendation for ${first.title}`, { exact: true })
    .fill("A thoughtful book.");
  await page
    .getByLabel(`Retailer URL for ${first.title}`, { exact: true })
    .fill("https://example.test/book?ref=curator");
  await page
    .getByLabel(`This is an affiliate link for ${first.title}`, { exact: true })
    .check();
  await page.getByRole("button", { name: `Move ${second.title} up` }).click();
  await page.route("**/api/creator-shop", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary failure" }),
    }),
  );
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Temporary failure");
  await expect(page.getByLabel("Shop title", { exact: true })).toHaveValue(
    "My carefully chosen books",
  );
  await page.unroute("**/api/creator-shop");
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Shop saved" }),
  ).toContainText("saved privately");
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByText("This page could not be found."),
  ).toBeVisible();
  const exported = (
    await (await page.request.get("/api/library/export")).json()
  ).curatorShop;
  expect(exported.entries.map((e: any) => e.workId)).toEqual([
    second.id,
    first.id,
  ]);
  const retry = await page.request.put("/api/creator-shop", {
    data: { version: 0, shop: exported },
  });
  expect(retry.status()).toBe(200);
  const journal = await (
    await page.request.get(`/api/library/${copy.id}/journal`)
  ).json();
  expect(journal.shopEntry.note).toBe("A thoughtful book.");
  await page.getByLabel("Publish my shop", { exact: true }).check();
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Shop saved" }),
  ).toContainText("public profile");
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByRole("heading", { name: "My carefully chosen books" }),
  ).toBeVisible();
  await expect(
    visitor.getByText("Affiliate link: this curator may earn a commission."),
  ).toBeVisible();
  await expect(
    visitor.getByRole("link", { name: `Visit retailer for ${first.title}` }),
  ).toHaveAttribute("rel", "sponsored noopener noreferrer");
  expect(await visitor.locator("body").innerText()).not.toContain(
    "PRIVATE_LIBRARY_NOTES",
  );
  expect(await visitor.locator("body").innerText()).not.toContain(
    "PRIVATE_ACCOUNT_NAME",
  );
  await visitor.goto(`/profile/${user.username}`);
  await expect(
    visitor.getByRole("link", { name: "Curated book shop" }),
  ).toHaveAttribute("href", publicUrl);
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: false },
  });
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByText("This page could not be found."),
  ).toBeVisible();
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: true },
  });
  const saved = (await (await page.request.get("/api/library/export")).json())
    .curatorShop;
  expect(
    (
      await page.request.put("/api/creator-shop", {
        data: {
          version: saved.version,
          shop: { ...saved, introduction: "Changed elsewhere" },
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByLabel("Shop introduction", { exact: true })
    .fill("My conflicting draft");
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("changed elsewhere");
  await expect(
    page.getByLabel("Shop introduction", { exact: true }),
  ).toHaveValue("My conflicting draft");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page.getByLabel("Publish my shop", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Shop saved" }),
  ).toContainText("privately");
  await visitor.goto(publicUrl);
  await expect(
    visitor.getByText("This page could not be found."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Remove ${first.title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(
    editor.getByRole("status").filter({ hasText: "Shop saved" }),
  ).toContainText("privately");
  expect(
    (await (await page.request.get(`/api/library/${copy.id}/journal`)).json())
      .shopEntry,
  ).toBeNull();
  expect(
    (await db.userBook.findUniqueOrThrow({ where: { id: copy.id } }))
      .privateNotes,
  ).toBe("PRIVATE_LIBRARY_NOTES");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/curator-shop-mobile.png" });
  await other.close();
});

test("shop ownership, validation, retained books and account cascades", async ({
  page,
  browser,
}) => {
  const user = await login(page, "privacy"),
    work = await add(user.id, `Shop ${stamp} Private`);
  const other = await browser.newContext(),
    visitor = await other.newPage();
  const draft = {
    title: "Private choices",
    introduction: "",
    isPublic: false,
    entries: [
      {
        workId: work.id,
        note: "My own recommendation",
        retailerUrl: "",
        affiliate: false,
      },
    ],
  };
  expect(
    (
      await visitor.request.put("/api/creator-shop", {
        data: { version: 0, shop: draft },
      })
    ).status(),
  ).toBe(401);
  await login(visitor, "outsider");
  expect(
    (
      await visitor.request.put("/api/creator-shop", {
        data: { version: 0, shop: draft },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.put("/api/creator-shop", {
        headers: { Origin: "https://other.test" },
        data: { version: 0, shop: draft },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.put("/api/creator-shop", {
        data: {
          version: 0,
          shop: {
            ...draft,
            entries: [
              { ...draft.entries[0], retailerUrl: "javascript:alert(1)" },
            ],
          },
        },
      })
    ).status(),
  ).toBe(400);
  await db.user.update({
    where: { id: user.id },
    data: { profilePublic: false },
  });
  expect(
    (
      await page.request.put("/api/creator-shop", {
        data: { version: 0, shop: { ...draft, isPublic: true } },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.put("/api/creator-shop", {
        data: { version: 0, shop: draft },
      })
    ).status(),
  ).toBe(200);
  await db.userBook.deleteMany({ where: { userId: user.id } });
  expect(
    (
      await page.request.put("/api/creator-shop", {
        data: { version: 1, shop: { ...draft, title: "Retained book" } },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await visitor.request.get("/api/library/export")).json())
      .curatorShop,
  ).toBeNull();
  await db.user.delete({ where: { id: user.id } });
  expect(await db.curatorShopEntry.count({ where: { userId: user.id } })).toBe(
    0,
  );
  expect(await db.curatorShop.count({ where: { userId: user.id } })).toBe(0);
  expect(await db.work.findUnique({ where: { id: work.id } })).not.toBeNull();
  await other.close();
});
