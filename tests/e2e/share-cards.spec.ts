import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import "dotenv/config";
const stamp = Date.now();
const password = "share-card-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `share-card-${stamp}-${suffix}@example.test`;
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
      username: `sc${stamp}${suffix}`,
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
    where: { email: { startsWith: `share-card-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Card ${stamp}` } },
  });
  await db.$disconnect();
});
test("book and quote cards export matching PNGs with optional byline and unchanged privacy", async ({
  page,
}) => {
  const owner = await login(page, "export");
  const book = await add(owner.id, `Card ${stamp} The art of reading`);
  const drawn: string[] = [];
  await page.exposeFunction("captureCardText", (value: string) =>
    drawn.push(value),
  );
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      void (
        window as unknown as {
          captureCardText: (value: string) => Promise<void>;
        }
      ).captureCardText(text);
      if (maxWidth === undefined) return original.call(this, text, x, y);
      return original.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto("/creator");
  await page
    .getByRole("link", { name: "Make shareable cards", exact: true })
    .click();
  await page
    .getByRole("button", { name: `${book.title} / A. Reader`, exact: true })
    .click();
  await page.getByLabel("Caption (optional)").fill("A book to return to.");
  const downloadButton = page.getByRole("button", {
    name: "Download PNG",
    exact: true,
  });
  await expect(downloadButton).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute(
    "aria-label",
    `${book.title}`.replace(/^/, "A book to return to. / ") + " / A. Reader",
  );
  expect(drawn.join(" ")).not.toContain(owner.username);
  expect(drawn.join(" ")).not.toContain("PRIVATE_");
  const first = page.waitForEvent("download");
  await downloadButton.click();
  const png = await first;
  expect(png.suggestedFilename()).toBe("folio-book-card-square.png");
  await png.saveAs("test-results/book-card.png");
  const metadata = await sharp("test-results/book-card.png").metadata();
  expect(metadata.width).toBe(1080);
  expect(metadata.height).toBe(1080);
  expect(metadata.format).toBe("png");
  const preview = await page
    .locator("canvas")
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
  expect(
    (
      await sharp(Buffer.from(preview.split(",")[1], "base64"))
        .raw()
        .toBuffer()
    ).equals(await sharp("test-results/book-card.png").raw().toBuffer()),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Card type", exact: true })
    .selectOption("quote");
  await expect(downloadButton).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Quote", exact: true })
    .fill("Reading gives us a quiet place to begin again.");
  await page.getByLabel("Page or reference (optional)").fill("p. 42");
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("portrait");
  await page
    .getByRole("combobox", { name: "Colour theme", exact: true })
    .selectOption("night");
  await page
    .getByRole("checkbox", { name: new RegExp("Include public byline") })
    .check();
  await expect(downloadButton).toBeEnabled();
  const second = page.waitForEvent("download");
  await downloadButton.click();
  const quote = await second;
  await quote.saveAs("test-results/quote-card.png");
  expect((await sharp("test-results/quote-card.png").metadata()).height).toBe(
    1350,
  );
  await expect(
    page.getByRole("region", { name: "Card preview" }).getByRole("img"),
  ).toHaveAttribute("aria-label", new RegExp(owner.username!));
  expect(drawn.join(" ")).toContain(`@${owner.username}`);
  expect(drawn.join(" ")).not.toContain("PRIVATE_LIBRARY_NOTES");
  const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  expect(after.profilePublic).toBe(true);
  expect(after.blogEnabled).toBe(false);
  expect(await db.article.count({ where: { userId: owner.id } })).toBe(0);
  await page.locator("canvas").evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const original = canvas.toBlob.bind(canvas);
    canvas.toBlob = (callback, type, quality) => {
      canvas.toBlob = original;
      callback(null);
    };
  });
  await downloadButton.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not create the PNG" }),
  ).toBeVisible();
  await expect(downloadButton).toBeEnabled();
  const retry = page.waitForEvent("download");
  await downloadButton.click();
  await retry;
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Preview", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/card-studio-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Quote", exact: true })
    .fill("W".repeat(500));
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("square");
  await expect(downloadButton).toBeDisabled();
  await expect(
    page.getByRole("alert").filter({ hasText: "too long" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("portrait");
  await expect(downloadButton).toBeEnabled();
});
test("collection search and pagination stay private and recover from lookup failure", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "collection");
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: false },
  });
  for (let i = 0; i < 21; i++) await add(owner.id, `Card ${stamp} shelf ${i}`);
  await page.goto("/creator/cards");
  await expect(
    page.getByRole("checkbox", { name: /Include public byline/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next books", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next books", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next books", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Search your collection", { exact: true })
    .fill(`Card ${stamp} shelf 12`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Card ${stamp} shelf 12 / A. Reader`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/articles/books?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Collection temporarily unavailable" }),
    }),
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toBeVisible();
  await page.unroute("**/api/articles/books?**");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toHaveCount(0);
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, "empty");
  await other.goto("/creator/cards");
  await expect(
    other.getByText("No matching books in your collection.", { exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeDisabled();
  await expect(other.locator("body")).not.toContainText(`Card ${stamp}`);
  await context.close();
});

test("reading-year recap counts only the owner's dated activity and exports without publishing", async ({
  page,
}) => {
  const owner = await login(page, "recap");
  await db.user.update({
    where: { id: owner.id },
    data: { profilePublic: false },
  });
  await add(owner.id, `Card ${stamp} Recap`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await db.userBook.update({
    where: { id: book.id },
    data: { dateFinished: new Date("2024-12-31T12:00:00Z") },
  });
  await db.readingSession.createMany({
    data: [
      {
        userId: owner.id,
        userBookId: book.id,
        date: new Date("2024-01-01T12:00:00Z"),
        pageStart: 0,
        pageEnd: 30,
        note: "PRIVATE_SESSION_NOTE",
      },
      {
        userId: owner.id,
        userBookId: book.id,
        date: new Date("2024-01-01T15:00:00Z"),
        pageStart: 30,
        pageEnd: 50,
      },
      {
        userId: owner.id,
        userBookId: book.id,
        date: new Date("2024-12-31T12:00:00Z"),
        pageStart: 50,
        pageEnd: 60,
      },
      {
        userId: owner.id,
        userBookId: book.id,
        date: new Date("2025-01-01T00:00:00Z"),
        pageStart: 60,
        pageEnd: 100,
      },
    ],
  });
  await page.goto("/creator/recap?year=2024");
  const preview = page
    .getByRole("region", { name: "Card preview" })
    .getByRole("img");
  await expect(preview).toHaveAttribute(
    "aria-label",
    "2024 reading recap / 1 books finished / 60 pages logged / 2 reading days / Through 2024-12-31",
  );
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(await page.content()).not.toContain("PRIVATE_SESSION_NOTE");
  expect(await page.content()).not.toContain("PRIVATE_LIBRARY_NOTES");
  const downloadButton = page.getByRole("button", {
    name: "Download PNG",
    exact: true,
  });
  await expect(downloadButton).toBeEnabled();
  const downloading = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("folio-recap-2024-card-square.png");
  await download.saveAs("test-results/recap-card.png");
  expect((await sharp("test-results/recap-card.png").metadata()).width).toBe(
    1080,
  );
  const data = await preview.evaluate((c) =>
    (c as HTMLCanvasElement).toDataURL(),
  );
  expect(
    (
      await sharp(Buffer.from(data.split(",")[1], "base64"))
        .raw()
        .toBuffer()
    ).equals(await sharp("test-results/recap-card.png").raw().toBuffer()),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("portrait");
  await page
    .getByRole("combobox", { name: "Colour theme", exact: true })
    .selectOption("night");
  await expect(downloadButton).toBeEnabled();
  const portraitDownload = page.waitForEvent("download");
  await downloadButton.click();
  await (await portraitDownload).saveAs("test-results/recap-portrait.png");
  expect(
    (await sharp("test-results/recap-portrait.png").metadata()).height,
  ).toBe(1350);
  await page.getByRole("spinbutton", { name: "Reading year" }).fill("2023");
  await page.getByRole("button", { name: "View year" }).click();
  await expect(preview).toHaveAttribute(
    "aria-label",
    /2023 reading recap \/ 0 books finished \/ 0 pages logged \/ 0 reading days/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Preview", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/recap-mobile.png" });
  const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  expect(after.profilePublic).toBe(false);
  expect(after.blogEnabled).toBe(false);
  await login(page, "recapother");
  await page.goto("/creator/recap?year=2024");
  await expect(preview).toHaveAttribute(
    "aria-label",
    /0 books finished \/ 0 pages logged \/ 0 reading days/,
  );
});

test("shelfie selection, ordering and exports preserve private library data", async ({
  page,
}) => {
  const owner = await login(page, "shelfie");
  const titles = [];
  for (let index = 0; index < 7; index++) {
    const title = `Card ${stamp} Shelf ${index}`;
    titles.push(title);
    await add(owner.id, title);
  }
  await page.goto("/creator/cards");
  await page
    .getByRole("combobox", { name: "Card type", exact: true })
    .selectOption("shelfie");
  const downloadButton = page.getByRole("button", {
    name: "Download PNG",
    exact: true,
  });
  await expect(downloadButton).toBeDisabled();
  for (const title of titles.slice(0, 6))
    await page
      .getByRole("button", { name: `${title} / A. Reader`, exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: `${titles[6]} / A. Reader`, exact: true }),
  ).toBeDisabled();
  const selected = page.getByRole("list", { name: "Selected books" });
  await expect(selected.getByRole("listitem")).toHaveCount(6);
  await page
    .getByRole("textbox", { name: "Shelfie heading (optional)", exact: true })
    .fill("Books to keep close");
  await page
    .getByRole("button", { name: `Move ${titles[1]} up`, exact: true })
    .click();
  await expect(selected.getByRole("listitem").first()).toContainText(titles[1]);
  const preview = page
    .getByRole("region", { name: "Card preview" })
    .getByRole("img");
  await expect(preview).toHaveAttribute(
    "aria-label",
    [
      "Books to keep close",
      ...[1, 0, 2, 3, 4, 5].map((i) => `${titles[i]} / A. Reader`),
    ].join(" / "),
  );
  await expect(downloadButton).toBeEnabled();
  const downloading = page.waitForEvent("download");
  await downloadButton.click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe("folio-shelfie-card-square.png");
  await file.saveAs("test-results/shelfie-card.png");
  const data = await preview.evaluate((c) =>
    (c as HTMLCanvasElement).toDataURL(),
  );
  expect(
    (
      await sharp(Buffer.from(data.split(",")[1], "base64"))
        .raw()
        .toBuffer()
    ).equals(await sharp("test-results/shelfie-card.png").raw().toBuffer()),
  ).toBe(true);
  await page
    .getByRole("button", { name: `Remove ${titles[0]}`, exact: true })
    .click();
  await expect(selected.getByRole("listitem")).toHaveCount(5);
  await page
    .getByRole("button", { name: `${titles[6]} / A. Reader`, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search your collection" })
    .fill("no matching title");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No matching books in your collection."),
  ).toBeVisible();
  await expect(selected.getByRole("listitem")).toHaveCount(6);
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("portrait");
  await page
    .getByRole("combobox", { name: "Colour theme", exact: true })
    .selectOption("night");
  await expect(downloadButton).toBeEnabled();
  const portrait = page.waitForEvent("download");
  await downloadButton.click();
  await (await portrait).saveAs("test-results/shelfie-portrait.png");
  expect(
    (await sharp("test-results/shelfie-portrait.png").metadata()).height,
  ).toBe(1350);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Preview", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/shelfie-mobile.png" });
  for (const title of titles.filter((_, index) => index !== 0))
    await page
      .getByRole("button", { name: `Remove ${title}`, exact: true })
      .click();
  await expect(downloadButton).toBeDisabled();
  expect(
    await db.userBook.count({
      where: { userId: owner.id, privateNotes: "PRIVATE_LIBRARY_NOTES" },
    }),
  ).toBe(7);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).blogEnabled,
  ).toBe(false);
});
