import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const prefix = `Metadata E2E ${stamp}`;
const email = `folio-metadata-${stamp}@example.test`;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
test.skip(
  !process.env.METADATA_FIXTURE,
  "Run npm run test:metadata for the isolated provider fixture.",
);
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.work.deleteMany({ where: { title: { startsWith: prefix } } });
  await db.$disconnect();
});
test("remote edition identity, languages and credits persist without changing saved progress", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          name: "Metadata reader",
          email,
          password: "metadata-test-password",
        },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "metadata-test-password" },
  });
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const work = await db.work.create({
    data: {
      title: `${prefix} Original`,
      authorName: "Fixture Author",
      openLibraryId: "OL991000W",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "paperback",
          isbn13: "9780804429573",
          pageCount: 111,
        },
      },
    },
    include: { editions: true },
  });
  const original = await db.userBook.create({
    data: {
      userId: user.id,
      editionId: work.editions[0].id,
      shelf: "reading_now",
      privateNotes: "Keep these notes",
      readingSessions: {
        create: { userId: user.id, pageStart: 0, pageEnd: 20 },
      },
    },
  });
  const foreign = await db.work.create({
    data: {
      title: `${prefix} Other`,
      authorName: "Other Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: { create: { format: "hardback", isbn13: "9780306406157" } },
    },
  });
  const unresolved = await db.work.create({
    data: {
      title: `${prefix} ISBN only`,
      authorName: "Other Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: { create: { format: "paperback", isbn13: "9780679783268" } },
    },
  });
  const isbnResponse = await page.request.get(
    `/api/works/${unresolved.id}/editions`,
  );
  expect(isbnResponse.status()).toBe(200);
  expect((await isbnResponse.json()).sourceWorkId).toBe("OL993000W");
  const anonymous = await browser.newContext();
  expect(
    (await anonymous.request.get(`/api/works/${work.id}/editions`)).status(),
  ).toBe(401);
  expect(
    (
      await anonymous.request.post(`/api/works/${work.id}/editions`, {
        data: { sourceEditionId: "OL991001M" },
      })
    ).status(),
  ).toBe(401);
  await anonymous.close();
  await page.goto(`/book/${work.id}`);
  await page.request.get(`${process.env.METADATA_FIXTURE}/__fail_next`);
  await page
    .getByRole("button", {
      name: "Load editions from Open Library",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "unavailable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry loading editions", exact: true })
    .click();
  await expect(
    page.getByText("Translated by Synthetic Translator", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not a translator", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Edition language", exact: true })
    .selectOption("fre");
  await expect(
    page.getByRole("heading", { name: "The French Copy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose this edition", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(page).toHaveURL(/\/library\?book=/);
  await expect(
    page.getByRole("dialog", { name: "The French Copy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Synthetic Translator", { exact: true }),
  ).toBeVisible();
  const imported = await db.edition.findUniqueOrThrow({
    where: { openLibraryId: "OL991001M" },
  });
  expect(imported.languages).toEqual(["fre"]);
  expect(imported.translators).toEqual(["Synthetic Translator"]);
  expect(imported.workId).toBe(work.id);
  expect(imported.editionTitle).toBe("The French Copy");
  const retry = await page.request.post(`/api/works/${work.id}/editions`, {
    data: {
      sourceEditionId: "OL991001M",
      pageCount: 12345,
      translators: ["Forged credit"],
    },
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).book.editionId).toBe(imported.id);
  expect(
    await db.edition.count({ where: { openLibraryId: "OL991001M" } }),
  ).toBe(1);
  expect(
    (await db.edition.findUniqueOrThrow({ where: { id: imported.id } }))
      .translators,
  ).toEqual(["Synthetic Translator"]);
  expect(
    (
      await page.request.post(`/api/works/${work.id}/editions`, {
        data: { sourceEditionId: "OL991003M" },
      })
    ).status(),
  ).toBe(200);
  const unchanged = await db.userBook.findUniqueOrThrow({
    where: { id: original.id },
    include: { edition: true, readingSessions: true },
  });
  expect(unchanged.edition.pageCount).toBe(111);
  expect(unchanged.privateNotes).toBe("Keep these notes");
  expect(unchanged.readingSessions[0].pageEnd).toBe(20);
  expect(unchanged.edition.languages).toEqual(["eng"]);
  for (const sourceEditionId of ["OL992000M", "OL992001M", "OL992003M"])
    expect(
      (
        await page.request.post(`/api/works/${work.id}/editions`, {
          data: { sourceEditionId },
        })
      ).status(),
    ).toBe(409);
  expect(
    (
      await page.request.get(`/api/works/${work.id}/editions?offset=-1`)
    ).status(),
  ).toBe(400);
  expect(
    (await db.edition.findUniqueOrThrow({ where: { isbn13: "9780306406157" } }))
      .workId,
  ).toBe(foreign.id);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`/book/${work.id}`);
  await page
    .getByRole("button", {
      name: "Load editions from Open Library",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Load more editions", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Edition language", exact: true })
    .selectOption("jpn");
  await expect(
    page.getByRole("heading", { name: "The Japanese Copy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more editions", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Choose this edition", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "The Japanese Copy", exact: true }),
  ).toBeVisible();
  expect(
    (
      await db.edition.findUniqueOrThrow({
        where: { openLibraryId: "OL991021M" },
      })
    ).format,
  ).toBe("unknown");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Editions", exact: true }).click();
  await expect(
    page.getByText("Translated by Second Translator", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/edition-metadata-mobile.png" });
});
