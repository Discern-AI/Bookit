import { readFile } from "node:fs/promises";
import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "context-sharing-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `context-sharing-${stamp}-${suffix}@example.test`;
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
      username: `shr${stamp}${suffix}`,
      publicName: "Public reader",
      profilePublic: true,
    },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `context-sharing-${stamp}-` } },
  });
  await db.$disconnect();
});
test("context sharing is explicit, scoped, previewed and consumed once", async ({
  page,
}) => {
  const user = await login(page, "owner");
  const profile = {
    lifeContext: "PROFILE_ONLY",
    readingTimes: [],
    timeAvailable: "Not specified",
  };
  expect(
    (
      await page.request.patch("/api/context", {
        data: { action: "save", version: 0, profile },
      })
    ).status(),
  ).toBe(200);
  const id = crypto.randomUUID();
  expect(
    (
      await page.request.patch("/api/context/diary", {
        data: {
          action: "save",
          id,
          version: 0,
          contextVersion: 1,
          text: "SELECTED_DIARY",
        },
      })
    ).status(),
  ).toBe(200);
  const selection = { contextVersion: 2, profile: false, diaryIds: [id] };
  const preview = await page.request.post("/api/context/preview", {
    data: selection,
  });
  expect(preview.status()).toBe(200);
  expect(await preview.text()).not.toContain("PROFILE_ONLY");
  expect(
    (
      await page.request.post("/api/context/preview", {
        data: { ...selection, diaryIds: [crypto.randomUUID()] },
      })
    ).status(),
  ).toBe(409);
  const foreign = await page
    .context()
    .browser()!
    .newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  expect(
    (
      await foreign.request.post("/api/context/preview", { data: selection })
    ).status(),
  ).toBe(401);
  await login(await foreign.newPage(), "other");
  expect(
    (
      await foreign.request.post("/api/context/preview", {
        data: { ...selection, contextVersion: 0 },
      })
    ).status(),
  ).toBe(409);
  await foreign.close();
  await page.goto("/chat");
  const panel = page.getByRole("region", { name: "Personal context sharing" });
  await expect(panel).toContainText("sharing is off");
  await panel.getByRole("button", { name: "Choose personal context" }).click();
  await panel
    .getByRole("checkbox", { name: `Share diary entry ${id}` })
    .check();
  await panel.getByRole("button", { name: "Preview selected context" }).click();
  await expect(panel.getByLabel("Context to share")).toContainText(
    "SELECTED_DIARY",
  );
  await expect(panel.getByLabel("Context to share")).not.toContainText(
    "PROFILE_ONLY",
  );
  await panel
    .getByRole("button", { name: "Use reviewed context for next request" })
    .click();
  await panel
    .getByRole("button", { name: "Remove context from next request" })
    .click();
  await expect(panel).toContainText("sharing is off");
  await panel.getByRole("button", { name: "Choose personal context" }).click();
  await panel
    .getByRole("checkbox", { name: `Share diary entry ${id}` })
    .check();
  await panel.getByRole("button", { name: "Preview selected context" }).click();
  await panel
    .getByRole("button", { name: "Use reviewed context for next request" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const requests: any[] = [];
  await page.route("**/api/chat", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture provider unavailable" }),
    });
  });
  await page
    .getByLabel("Message your reading companion")
    .fill("Suggest a gentle reading mood");
  await page.getByLabel("Message your reading companion").press("Enter");
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].personalContext).toEqual(selection);
  expect(JSON.stringify(requests[0])).not.toContain("SELECTED_DIARY");
  await expect(panel).toContainText("sharing is off");
  await page
    .getByLabel("Message your reading companion")
    .fill("Try another suggestion");
  await page.getByLabel("Message your reading companion").press("Enter");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].personalContext).toBeUndefined();
  await page.unroute("**/api/chat");
  expect(
    (
      await page.request.patch("/api/context", {
        data: { action: "delete", version: 2 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/context/preview", { data: selection })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/chat", {
        data: {
          personalContext: selection,
          messages: [{ role: "user", content: "Test stale context" }],
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    await db.bookEntry.count({
      where: { userId: user.id, text: { contains: "SELECTED_DIARY" } },
    }),
  ).toBe(0);
});
