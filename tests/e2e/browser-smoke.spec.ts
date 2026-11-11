import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const stamp = Date.now();
const password = "browser-smoke-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(page: Page, suffix: string) {
  const email = `browser-smoke-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Browser smoke reader", email, password },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password },
  });
}

test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `browser-smoke-${stamp}-` } },
  });
  await db.$disconnect();
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`core ${viewport.name} routes render without overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page, viewport.name);
    for (const route of [
      "/chat",
      "/library",
      "/browse",
      "/community",
      "/settings",
    ]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.getByRole("main").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${route} should not overflow horizontally`,
      ).toBe(true);
    }
  });
}
