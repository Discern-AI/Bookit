import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const stamp = Date.now();
const password = "accessibility-test-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(page: Page, suffix: string) {
  const email = `accessibility-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Accessibility reader", email, password },
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
    where: { email: { startsWith: `accessibility-${stamp}-` } },
  });
  await db.$disconnect();
});

const routes = ["/chat", "/library", "/browse", "/community", "/settings"];

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`core ${viewport.name} screens have no serious accessibility violations`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await login(page, viewport.name);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("main").first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const severe = results.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id, impact, nodes }) => ({
          id,
          impact,
          targets: nodes.map((node) => node.target.join(" ")),
        }));
      expect(severe, `${route} accessibility violations`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${route} should not overflow horizontally`,
      ).toBe(true);
    }
  });
}
