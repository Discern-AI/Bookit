import { readFile } from "node:fs/promises";
import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "context-diary-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `context-diary-${stamp}-${suffix}@example.test`;
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
      username: `diy${stamp}${suffix}`,
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
    where: { email: { startsWith: `context-diary-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Diary ${stamp}` } },
  });
  await db.$disconnect();
});

test("diary saves, retains failed drafts, exports and rejects deleted drafts", async ({
  page,
}) => {
  const user = await login(page, "owner");
  await add(user.id, `Diary ${stamp} Book`);
  await page.goto("/settings/context/diary");
  await page.getByRole("button", { name: "New diary entry" }).click();
  await page.getByLabel("Entry text").fill("PRIVATE_DIARY_MARKER");
  await page.route("**/api/context/diary", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Save interrupted" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save diary entry" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Save interrupted" }),
  ).toBeVisible();
  await expect(page.getByLabel("Entry text")).toHaveValue(
    "PRIVATE_DIARY_MARKER",
  );
  await page.unroute("**/api/context/diary");
  await page.getByRole("button", { name: "Save diary entry" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Entry saved" }),
  ).toBeVisible();
  const snapshot = await (await page.request.get("/api/context/diary")).json();
  const entry = snapshot.entries[0];
  const outsider = await page
    .context()
    .browser()!
    .newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    });
  expect((await outsider.request.get("/api/context/diary")).status()).toBe(401);
  const foreignPage = await outsider.newPage();
  await login(foreignPage, "foreign");
  expect(
    (await (await outsider.request.get("/api/context/diary")).json()).entries,
  ).toEqual([]);
  expect(
    (
      await outsider.request.patch("/api/context/diary", {
        data: {
          action: "delete",
          id: entry.id,
          version: entry.version,
          contextVersion: 0,
        },
      })
    ).status(),
  ).toBe(404);
  await outsider.close();
  const stored = await db.contextDiaryEntry.findUniqueOrThrow({
    where: { id: entry.id },
  });
  expect(Buffer.from(stored.encryptedData!).toString()).not.toContain(
    "PRIVATE_DIARY_MARKER",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download saved context" }).click();
  const download = await downloadPromise;
  expect(
    JSON.parse(await readFile((await download.path())!, "utf8")).diary[0].text,
  ).toBe("PRIVATE_DIARY_MARKER");
  await page
    .getByRole("button", { name: "Edit diary entry 1", exact: true })
    .click();
  await page.getByLabel("Entry text").fill("Updated diary");
  await page.getByRole("button", { name: "Save diary entry" }).click();
  await expect(page.getByText("Updated diary", { exact: true })).toBeVisible();
  const beforeDelete = await (
    await page.request.get("/api/context/diary")
  ).json();
  await page.goto("/settings/context");
  await page.getByRole("button", { name: "Delete my context profile" }).click();
  await page.getByRole("button", { name: "Confirm delete context" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Context deleted" }),
  ).toBeVisible();
  expect(
    await db.contextDiaryEntry.count({
      where: { userId: user.id, encryptedData: { not: null } },
    }),
  ).toBe(0);
  for (const id of [entry.id, crypto.randomUUID()]) {
    expect(
      (
        await page.request.patch("/api/context/diary", {
          data: {
            action: "save",
            id,
            version: id === entry.id ? 2 : 0,
            contextVersion: beforeDelete.contextVersion,
            text: "Stale draft",
          },
        })
      ).status(),
    ).toBe(409);
  }
  expect(await db.userBook.count({ where: { userId: user.id } })).toBe(1);
});

test("diary pagination, corruption isolation, export failure and account cleanup", async ({
  page,
}) => {
  const user = await login(page, "pages");
  const created = await page.request.patch("/api/context/diary", {
    data: {
      action: "save",
      id: crypto.randomUUID(),
      version: 0,
      contextVersion: 0,
      text: "Original private entry",
    },
  });
  expect(created.status()).toBe(200);
  const first = (await created.json()).entry;
  const stored = await db.contextDiaryEntry.findUniqueOrThrow({
    where: { id: first.id },
  });
  // Copying ciphertext to other entry IDs must fail authentication.
  await db.contextDiaryEntry.createMany({
    data: Array.from({ length: 21 }, () => ({
      id: crypto.randomUUID(),
      userId: user.id,
      encryptedData: stored.encryptedData,
    })),
  });
  const one = await (
      await page.request.get("/api/context/diary?page=1")
    ).json(),
    two = await (await page.request.get("/api/context/diary?page=2")).json();
  expect(one.entries).toHaveLength(20);
  expect(one.hasNext).toBe(true);
  expect(two.entries).toHaveLength(2);
  expect(two.hasNext).toBe(false);
  expect(
    new Set([...one.entries, ...two.entries].map((e: any) => e.id)).size,
  ).toBe(22);
  expect(
    one.entries.filter((e: any) => e.text === null).length,
  ).toBeGreaterThan(0);
  expect((await page.request.get("/api/context/export")).status()).toBe(503);
  const bad = one.entries.find((e: any) => e.text === null);
  expect(
    (
      await page.request.patch("/api/context/diary", {
        data: {
          action: "save",
          id: bad.id,
          version: bad.version,
          contextVersion: one.contextVersion,
          text: "Overwrite corruption",
        },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await page.request.patch("/api/context/diary", {
        data: {
          action: "delete",
          id: bad.id,
          version: bad.version,
          contextVersion: one.contextVersion,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch("/api/context/diary", {
        headers: { Origin: "https://other.test" },
        data: {
          action: "save",
          id: crypto.randomUUID(),
          version: 0,
          contextVersion: 2,
          text: "No",
        },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/settings/context/diary");
  await expect(
    page.getByRole("button", { name: "Next entries" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next entries" }).click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await db.user.delete({ where: { id: user.id } });
  expect(await db.contextDiaryEntry.count({ where: { userId: user.id } })).toBe(
    0,
  );
});
