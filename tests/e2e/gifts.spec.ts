import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { localDate, shiftDay } from "../../lib/reading";
const stamp = Date.now();
const prefix = `Gift E2E ${stamp}`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `folio-gift-${stamp}-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Gift reader", email, password: "gift-test-password" },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "gift-test-password" },
  });
  return (await db.user.findUniqueOrThrow({ where: { email } })).id;
}
async function work(suffix: string) {
  return db.work.create({
    data: {
      title: `${prefix} ${suffix}`,
      authorName: "Gift Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: { create: { format: "paperback", pageCount: 100 } },
    },
    include: { editions: true },
  });
}
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `folio-gift-${stamp}-` } },
  });
  await db.work.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.$disconnect();
});
test("gift planning persists privately with budget reminders and bought/given status", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const userId = await login(page, "owner");
  const first = await work("First");
  const second = await work("Second");
  await db.userBook.create({
    data: { userId, editionId: first.editions[0].id, shelf: "tbr" },
  });
  await page.goto("/library");
  await page.getByRole("link", { name: "Gift lists", exact: true }).click();
  await page.getByRole("link", { name: "Add someone", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Recipient name", exact: true })
    .fill(`${prefix} Mum`);
  await page
    .getByRole("textbox", { name: "Reading preferences", exact: true })
    .fill("PRIVATE_RECIPIENT_PREFERENCES");
  await page
    .getByRole("textbox", { name: "Budget per gift (GBP)", exact: true })
    .fill("20.00");
  await page.getByRole("button", { name: "Add occasion", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Occasion 1 label", exact: true })
    .fill("Birthday");
  await page
    .getByLabel("Occasion 1 date", { exact: true })
    .fill(shiftDay(localDate(), 5));
  await page
    .getByRole("checkbox", { name: "Repeat every year", exact: true })
    .check();
  await page
    .getByRole("textbox", { name: "Search books for gifts", exact: true })
    .fill(prefix);
  for (const book of [first, second])
    await page
      .getByRole("button", { name: `Add ${book.title} as a gift`, exact: true })
      .click();
  await expect(
    page.getByRole("button", {
      name: `Add ${first.title} as a gift`,
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", {
      name: `Price estimate for ${first.title}`,
      exact: true,
    })
    .fill("12.34");
  await page
    .getByRole("textbox", {
      name: `Price estimate for ${second.title}`,
      exact: true,
    })
    .fill("40");
  await page
    .getByRole("textbox", { name: `Gift note for ${first.title}`, exact: true })
    .fill("PRIVATE_GIFT_NOTE");
  await page
    .getByRole("combobox", { name: `Fit for ${first.title}`, exact: true })
    .selectOption("perfect_fit");
  await page
    .getByRole("button", { name: "Save gift list", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Gift ideas for ${prefix} Mum`,
      exact: true,
    }),
  ).toBeVisible();
  const contact = await db.giftContact.findFirstOrThrow({
    where: { userId },
    include: { giftItems: true },
  });
  expect(contact.budgetPence).toBe(2000);
  expect(contact.giftItems.find((i) => i.workId === first.id)?.pricePence).toBe(
    1234,
  );
  await page.reload();
  await expect(
    page.getByText("PRIVATE_GIFT_NOTE", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Over budget", { exact: false })).toBeVisible();
  const anonContext = await browser.newContext();
  const anon = await anonContext.newPage();
  expect((await anon.request.get(`/api/gifts/${contact.id}`)).status()).toBe(
    401,
  );
  await anon.goto(`/library/gifts/${contact.id}`);
  await expect(anon).toHaveURL(/\/login$/);
  const publicBook = await anon.goto(`/book/${first.id}`);
  expect(await publicBook!.text()).not.toContain("PRIVATE_GIFT_NOTE");
  expect(await publicBook!.text()).not.toContain(
    "PRIVATE_RECIPIENT_PREFERENCES",
  );
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "other");
  expect((await other.request.get(`/api/gifts/${contact.id}`)).status()).toBe(
    404,
  );
  await other.goto(`/library/gifts/${contact.id}`);
  await expect(
    other.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByText("PRIVATE_RECIPIENT_PREFERENCES", { exact: true }),
  ).toHaveCount(0);
  await expect(
    other.getByText("PRIVATE_GIFT_NOTE", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await other.request.delete(`/api/gifts/${contact.id}`, {
        data: { version: contact.version },
      })
    ).status(),
  ).toBe(404);
  expect((await other.request.get("/api/gifts/contacts")).ok()).toBe(true);
  expect(
    (await (await other.request.get("/api/gifts/contacts")).json()).contacts,
  ).toHaveLength(0);
  await page.goto("/library/gifts");
  const reminder = page.getByRole("region", {
    name: `Reminder for ${prefix} Mum`,
    exact: true,
  });
  await expect(reminder).toContainText("is in 5 days");
  await expect(
    reminder.getByRole("link", { name: first.title, exact: true }),
  ).toBeVisible();
  await expect(
    reminder.getByRole("link", { name: second.title, exact: true }),
  ).toHaveCount(0);
  await reminder
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(reminder).toHaveCount(0);
  await page.goto(`/library/gifts/${contact.id}/edit`);
  await page
    .getByRole("combobox", { name: `Status for ${first.title}`, exact: true })
    .selectOption("bought");
  await page
    .getByRole("button", { name: "Save gift list", exact: true })
    .click();
  await expect(page.getByText("bought", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit gift list", exact: true }).click();
  await page
    .getByRole("combobox", { name: `Status for ${first.title}`, exact: true })
    .selectOption("given");
  await page
    .getByRole("button", { name: "Save gift list", exact: true })
    .click();
  await expect(page.getByText("given", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/gift-planning-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Edit gift list", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete person", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  expect(await db.giftContact.count({ where: { id: contact.id } })).toBe(1);
  await page
    .getByRole("button", { name: "Delete person", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\/gifts$/);
  expect(await db.giftContact.count({ where: { id: contact.id } })).toBe(0);
  expect(await db.giftItem.count({ where: { contactId: contact.id } })).toBe(0);
  expect(await db.userBook.count({ where: { userId } })).toBe(1);
  await anonContext.close();
  await otherContext.close();
});
test("gift retries, invalid input and stale edits preserve saved data and drafts", async ({
  page,
  browser,
}) => {
  const userId = await login(page, "validation");
  const book = await work("Validation");
  const body = {
    id: randomUUID(),
    name: `${prefix} Recipient`,
    tasteNotes: "",
    budgetPence: 2500,
    occasions: [
      {
        id: randomUUID(),
        label: "Occasion",
        date: shiftDay(localDate(), 2),
        annual: false,
        dismissedFor: null,
      },
    ],
    items: [
      {
        workId: book.id,
        status: "planned",
        priority: "might_like",
        pricePence: null,
        note: "",
      },
    ],
  };
  const responses = await Promise.all([
    page.request.post("/api/gifts/contacts", { data: body }),
    page.request.post("/api/gifts/contacts", { data: body }),
  ]);
  expect(responses.map((r) => r.status())).toEqual([200, 200]);
  expect(await db.giftContact.count({ where: { userId } })).toBe(1);
  expect(
    (
      await page.request.post("/api/gifts/contacts", {
        data: { ...body, tasteNotes: "Changed retry" },
      })
    ).status(),
  ).toBe(409);
  for (const invalid of [
    { budgetPence: 1.5 },
    { budgetPence: -1 },
    { occasions: [{ ...body.occasions[0], date: "2026-02-30" }] },
    { items: [...body.items, ...body.items] },
    { items: [{ ...body.items[0], workId: "missing" }] },
  ])
    expect(
      (
        await page.request.post("/api/gifts/contacts", {
          data: { ...body, id: randomUUID(), ...invalid },
        })
      ).status(),
    ).toBe(400);
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "validation-other");
  expect(
    (
      await other.request.patch(`/api/gifts/${body.id}`, {
        data: { ...body, version: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.post(`/api/gifts/${body.id}/dismiss`, {
        data: {
          occasionId: body.occasions[0].id,
          occurrence: body.occasions[0].date,
        },
      })
    ).status(),
  ).toBe(404);
  await otherContext.close();
  await page.goto(`/library/gifts/${body.id}/edit`);
  await page
    .getByRole("textbox", { name: "Reading preferences", exact: true })
    .fill("Unsaved personal draft");
  expect(
    (
      await page.request.patch(`/api/gifts/${body.id}`, {
        data: { ...body, version: 1, tasteNotes: "Saved in another tab" },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Save gift list", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed in another tab" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Reading preferences", exact: true }),
  ).toHaveValue("Unsaved personal draft");
  expect(
    (await db.giftContact.findUniqueOrThrow({ where: { id: body.id } }))
      .tasteNotes,
  ).toBe("Saved in another tab");
  expect(
    (
      await page.request.delete(`/api/gifts/${body.id}`, {
        data: { version: 1 },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Reading preferences", exact: true }),
  ).toHaveValue("Unsaved personal draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(`/library/gifts/${body.id}`);
});
