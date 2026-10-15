import { readFile } from "node:fs/promises";
import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "reading-context-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `reading-context-${stamp}-${suffix}@example.test`;
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
      username: `ctx${stamp}${suffix}`,
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
    where: { email: { startsWith: `reading-context-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Context ${stamp}` } },
  });
  await db.$disconnect();
});

test("encrypted context autosaves, exports, rejects conflicts and deletes", async ({
  page,
}) => {
  const user = await login(page, "owner"),
    work = await add(user.id, `Context ${stamp} Book`);
  await page.goto("/settings/context");
  await expect(
    page.getByLabel("Life right now", { exact: true }),
  ).toBeEnabled();
  await page.route("**/api/context", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Context save interrupted" }),
        })
      : route.continue(),
  );
  await page
    .getByLabel("Life right now", { exact: true })
    .fill("PRIVATE_CONTEXT_MARKER");
  await page.getByRole("heading", { name: "Your reading context" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "interrupted" }),
  ).toBeVisible();
  await expect(page.getByLabel("Life right now", { exact: true })).toHaveValue(
    "PRIVATE_CONTEXT_MARKER",
  );
  await page.unroute("**/api/context");
  await page.getByRole("button", { name: "Save context now" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();
  await page.getByLabel("Evenings", { exact: true }).check();
  await expect(
    page.getByLabel("Time available", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Time available", { exact: true })
    .selectOption("30-60 minutes");
  await expect(
    page.getByRole("button", { name: "Download saved context" }),
  ).toBeEnabled();
  const current = await (await page.request.get("/api/context")).json();
  expect(current.profile.readingTimes).toEqual(["Evenings"]);
  expect(current.profile.timeAvailable).toBe("30-60 minutes");
  const encrypted = await db.readingContext.findUniqueOrThrow({
    where: { userId: user.id },
  });
  expect(
    Buffer.from(encrypted.encryptedData!).includes(
      Buffer.from("PRIVATE_CONTEXT_MARKER"),
    ),
  ).toBe(false);
  expect(
    JSON.stringify(
      await (await page.request.get("/api/library/export")).json(),
    ),
  ).not.toContain("PRIVATE_CONTEXT_MARKER");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download saved context" }).click();
  const downloaded = await pending;
  expect(
    JSON.parse(await readFile((await downloaded.path())!, "utf8")).profile,
  ).toEqual(current.profile);
  const update = {
    action: "save",
    version: current.version,
    profile: { ...current.profile, lifeContext: "Changed elsewhere" },
  };
  expect(
    (await page.request.patch("/api/context", { data: update })).status(),
  ).toBe(200);
  expect(
    (await page.request.patch("/api/context", { data: update })).status(),
  ).toBe(200);
  await page
    .getByLabel("Life right now", { exact: true })
    .fill("Retain conflicting draft");
  await page.getByRole("heading", { name: "Your reading context" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed or was deleted" }),
  ).toBeVisible();
  await expect(page.getByLabel("Life right now", { exact: true })).toHaveValue(
    "Retain conflicting draft",
  );
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByLabel("Life right now", { exact: true })).toHaveValue(
    "Changed elsewhere",
  );
  await page.getByRole("button", { name: "Delete my context profile" }).click();
  await page.getByRole("button", { name: "Keep my context" }).click();
  expect((await (await page.request.get("/api/context")).json()).hasData).toBe(
    true,
  );
  await page.getByRole("button", { name: "Delete my context profile" }).click();
  await page.getByRole("button", { name: "Confirm delete context" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Context deleted" }),
  ).toBeVisible();
  expect(
    (await db.readingContext.findUniqueOrThrow({ where: { userId: user.id } }))
      .encryptedData,
  ).toBeNull();
  expect(
    (await page.request.patch("/api/context", { data: update })).status(),
  ).toBe(409);
  expect(
    await db.userBook.count({
      where: { userId: user.id, edition: { workId: work.id } },
    }),
  ).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("context isolation, corrupt-data fail closed and account cascade", async ({
  page,
  browser,
}) => {
  const user = await login(page, "privacy");
  const profile = {
    lifeContext: "OWNER_CONTEXT_MARKER",
    readingTimes: [],
    timeAvailable: "Not specified",
  };
  const other = await browser.newContext(),
    visitor = await other.newPage();
  expect((await visitor.request.get("/api/context")).status()).toBe(401);
  expect(
    (
      await page.request.patch("/api/context", {
        headers: { Origin: "https://other.test" },
        data: { action: "save", version: 0, profile },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/context", {
        data: { action: "save", version: 0, profile },
      })
    ).status(),
  ).toBe(200);
  const second = await login(visitor, "other");
  expect(
    (await (await visitor.request.get(`/api/context?userId=${user.id}`)).json())
      .hasData,
  ).toBe(false);
  const source = await db.readingContext.findUniqueOrThrow({
    where: { userId: user.id },
  });
  await db.readingContext.create({
    data: { userId: second.id, encryptedData: source.encryptedData },
  });
  const blocked = await (await visitor.request.get("/api/context")).json();
  expect(blocked.available).toBe(false);
  expect(blocked.profile).toBeNull();
  expect(
    (
      await visitor.request.patch("/api/context", {
        data: { action: "save", version: 1, profile },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await visitor.request.patch("/api/context", {
        data: { action: "delete", version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await page.request.get("/api/context")).json()).profile,
  ).toEqual(profile);
  await db.user.delete({ where: { id: user.id } });
  expect(await db.readingContext.count({ where: { userId: user.id } })).toBe(0);
  await other.close();
});
