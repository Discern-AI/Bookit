import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
const stamp = Date.now();
const prefix = `Sharing E2E ${stamp}`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `folio-sharing-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          name: `Giver ${suffix}`,
          email,
          password: "sharing-test-password",
        },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "sharing-test-password" },
  });
  return (await db.user.findUniqueOrThrow({ where: { email } })).id;
}
async function createList(page: Page, userId: string, suffix: string) {
  const work = await db.work.create({
    data: {
      title: `${prefix} ${suffix}`,
      authorName: "Gift Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: { create: { format: "paperback" } },
    },
  });
  const body = {
    id: randomUUID(),
    name: `${prefix} Recipient ${suffix}`,
    tasteNotes: "PRIVATE_TASTE_NEVER_SHARED",
    budgetPence: 82347,
    occasions: [
      {
        id: randomUUID(),
        label: "PRIVATE_OCCASION_NEVER_SHARED",
        date: "2026-12-25",
        annual: true,
        dismissedFor: null,
      },
    ],
    items: [
      {
        workId: work.id,
        status: "planned",
        priority: "perfect_fit",
        pricePence: 54321,
        note: "PRIVATE_NOTE_NEVER_SHARED",
      },
    ],
  };
  expect(
    (await page.request.post("/api/gifts/contacts", { data: body })).status(),
  ).toBe(200);
  const item = await db.giftItem.findFirstOrThrow({
    where: { contactId: body.id },
  });
  return { body, item, work, userId };
}
async function tokenFor(page: Page, id: string, action = "enable") {
  const saved = await db.giftContact.findUniqueOrThrow({ where: { id } });
  const response = await page.request.post(`/api/gifts/${id}/share`, {
    data: { action, version: saved.version },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).shareToken as string | null;
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `folio-sharing-${stamp}-` } },
  });
  await db.work.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.$disconnect();
});
test("shared gift links expose only selected fields, return after signup and preserve claims through edits", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const userId = await login(page, "owner");
  const { body, item } = await createList(page, userId, "Privacy");
  await page.goto(`/library/gifts/${body.id}`);
  await page
    .getByRole("button", { name: "Share this list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Preferences, occasions, budget, price estimates and private notes remain hidden",
  );
  await page
    .getByRole("button", { name: "Create shared link", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Shared gift link", exact: true }),
  ).toBeVisible();
  const token = (
    await db.giftContact.findUniqueOrThrow({ where: { id: body.id } })
  ).shareToken!;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const shared = await guest.goto(`/gift/${token}`);
  expect(shared?.status()).toBe(200);
  const html = await shared!.text();
  for (const secret of [
    body.tasteNotes,
    body.items[0].note,
    body.occasions[0].label,
    body.id,
    userId,
  ])
    expect(html).not.toContain(secret);
  expect(shared!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(shared!.headers()["cache-control"]).toContain("no-store");
  await expect(guest.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  expect(
    (
      await guest.request.put(`/api/gift-shares/${token}/claims/${item.id}`, {
        data: { version: 0 },
      })
    ).status(),
  ).toBe(401);
  await guest
    .getByRole("link", { name: "Sign in to claim this gift", exact: true })
    .click();
  await guest
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await guest.getByLabel("Name", { exact: true }).fill("Private Giver Name");
  await guest
    .getByLabel("Email", { exact: true })
    .fill(`folio-sharing-${stamp}-signup@example.test`);
  await guest
    .getByLabel("Password", { exact: true })
    .fill("sharing-test-password");
  await guest
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(guest).toHaveURL(`/gift/${token}`);
  await guest
    .getByRole("button", { name: "Claim this gift", exact: true })
    .click();
  await expect(
    guest.getByText("You claimed this gift", { exact: true }),
  ).toBeVisible();
  const claimed = await db.giftItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(claimed.claimedById).not.toBeNull();
  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  const afterClaim = await publicPage.goto(`/gift/${token}`);
  expect(await afterClaim!.text()).not.toContain("Private Giver Name");
  expect(await afterClaim!.text()).not.toContain(claimed.claimedById!);
  await expect(publicPage.getByText("Claimed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("claimed by Private Giver Name", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit gift list", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Reading preferences", exact: true })
    .fill("Changed private preference");
  await page
    .getByRole("button", { name: "Save gift list", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Gift ideas for ${body.name}`,
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await db.giftItem.findUniqueOrThrow({ where: { id: item.id } }))
      .claimedById,
  ).toBe(claimed.claimedById);
  const current = await db.giftContact.findUniqueOrThrow({
    where: { id: body.id },
  });
  expect(
    (
      await page.request.patch(`/api/gifts/${body.id}`, {
        data: { ...body, items: [], version: current.version },
      })
    ).status(),
  ).toBe(409);
  expect(await db.giftItem.count({ where: { id: item.id } })).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await guest.setViewportSize({ width: 390, height: 844 });
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await guest.screenshot({
    path: ".local/shared-gifts-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Replace link", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm replacement", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.giftContact.findUniqueOrThrow({ where: { id: body.id } }))
          .shareToken,
    )
    .not.toBe(token);
  const rotated = (
    await db.giftContact.findUniqueOrThrow({ where: { id: body.id } })
  ).shareToken!;
  expect((await publicPage.goto(`/gift/${token}`))?.status()).toBe(404);
  expect(
    (
      await guest.request.delete(
        `/api/gift-shares/${token}/claims/${item.id}`,
        { data: { version: claimed.claimVersion } },
      )
    ).status(),
  ).toBe(404);
  expect(
    (await db.giftItem.findUniqueOrThrow({ where: { id: item.id } }))
      .claimedById,
  ).toBe(claimed.claimedById);
  await page.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm stop sharing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Share this list", exact: true }),
  ).toBeVisible();
  expect((await publicPage.goto(`/gift/${rotated}`))?.status()).toBe(404);
  await page
    .getByRole("button", { name: "Release claim", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm release", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gift claims", exact: true }),
  ).toHaveCount(0);
  expect(
    (await db.giftItem.findUniqueOrThrow({ where: { id: item.id } }))
      .claimedById,
  ).toBeNull();
  await guestContext.close();
  await anonymous.close();
});
test("simultaneous gift claims are exclusive and only the claimant or owner can release", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const userId = await login(page, "race-owner");
  const { body, item } = await createList(page, userId, "Race");
  const token = await tokenFor(page, body.id);
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  const aId = await login(a, "a");
  const bId = await login(b, "b");
  const endpoint = `/api/gift-shares/${token}/claims/${item.id}`;
  expect(
    (
      await a.request.post(`/api/gifts/${body.id}/share`, {
        data: { action: "disable", version: 2 },
      })
    ).status(),
  ).toBe(404);
  const results = await Promise.all([
    a.request.put(endpoint, { data: { version: 0, claimedById: userId } }),
    b.request.put(endpoint, { data: { version: 0 } }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const saved = await db.giftItem.findUniqueOrThrow({ where: { id: item.id } });
  expect([aId, bId]).toContain(saved.claimedById);
  const winner = saved.claimedById === aId ? a : b;
  const loser = winner === a ? b : a;
  expect(
    (await winner.request.put(endpoint, { data: { version: 0 } })).status(),
  ).toBe(200);
  expect(
    (await db.giftItem.findUniqueOrThrow({ where: { id: item.id } }))
      .claimVersion,
  ).toBe(1);
  expect(
    (await loser.request.delete(endpoint, { data: { version: 1 } })).status(),
  ).toBe(403);
  expect(
    (
      await loser.request.delete(`/api/gifts/${body.id}/claims/${item.id}`, {
        data: { version: 1 },
      })
    ).status(),
  ).toBe(404);
  const version = (
    await db.giftContact.findUniqueOrThrow({ where: { id: body.id } })
  ).version;
  expect(
    (
      await page.request.patch(`/api/gifts/${body.id}`, {
        data: {
          ...body,
          version,
          items: [{ ...body.items[0], status: "bought" }],
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await winner.request.delete(endpoint, { data: { version: 1 } })).status(),
  ).toBe(409);
  expect(
    (await db.giftItem.findUniqueOrThrow({ where: { id: item.id } }))
      .claimedById,
  ).toBe(saved.claimedById);
  expect(
    (await winner.request.delete(endpoint, { data: { version: 2 } })).status(),
  ).toBe(200);
  expect(
    (await winner.request.delete(endpoint, { data: { version: 2 } })).status(),
  ).toBe(200);
  expect(
    (await loser.request.put(endpoint, { data: { version: 3 } })).status(),
  ).toBe(409);
  const current = (
    await db.giftContact.findUniqueOrThrow({ where: { id: body.id } })
  ).version;
  expect(
    (
      await page.request.patch(`/api/gifts/${body.id}`, {
        data: { ...body, version: current },
      })
    ).status(),
  ).toBe(200);
  const refreshed = await db.giftItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(
    (
      await loser.request.put(endpoint, {
        data: { version: refreshed.claimVersion },
      })
    ).status(),
  ).toBe(200);
  const deletionVersion = (
    await db.giftContact.findUniqueOrThrow({ where: { id: body.id } })
  ).version;
  expect(
    (
      await page.request.delete(`/api/gifts/${body.id}`, {
        data: { version: deletionVersion },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await loser.request.delete(endpoint, {
        data: { version: refreshed.claimVersion + 1 },
      })
    ).status(),
  ).toBe(404);
  expect(await db.giftItem.count({ where: { id: item.id } })).toBe(0);
  await aContext.close();
  await bContext.close();
});
