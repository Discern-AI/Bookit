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
    "2024 reading recap / 1 reads finished / 60 pages logged / 2 reading days / Through 2024-12-31",
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
    /2023 reading recap \/ 0 reads finished \/ 0 pages logged \/ 0 reading days/,
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
    /0 reads finished \/ 0 pages logged \/ 0 reading days/,
  );
});

test("shelfie selection, ordering and exports preserve private library data", async ({
  page,
}) => {
  const owner = await login(page, "shelfie");
  const titles: string[] = [];
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

test("private card projects reopen, retain drafts and follow original journal records", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const owner = await login(page, "projects");
  const first = await add(owner.id, `Card ${stamp} Project first`);
  const second = await add(owner.id, `Card ${stamp} Project second`);
  const copies = await db.userBook.findMany({
    where: { userId: owner.id },
    include: { edition: true },
  });
  const one = copies.find((copy) => copy.edition.workId === first.id)!;
  const two = copies.find((copy) => copy.edition.workId === second.id)!;
  await page.goto("/creator/cards");
  await page
    .getByRole("button", { name: `${first.title} / A. Reader`, exact: true })
    .click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Private project title");
  await page
    .getByLabel("Caption (optional)", { exact: true })
    .fill("Private project caption");
  let captured: any;
  await page.route("**/api/card-projects", async (route) => {
    captured = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Save unavailable; draft retained." }),
    });
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Save card project" }).getByRole("alert"),
  ).toContainText("draft retained");
  await expect(
    page.getByLabel("Caption (optional)", { exact: true }),
  ).toHaveValue("Private project caption");
  await page.unroute("**/api/card-projects");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page).toHaveURL(/creator\/cards\?project=/);
  const id = new URL(page.url()).searchParams.get("project")!;
  expect(id).toBe(captured.id);
  expect(
    (await page.request.patch("/api/card-projects", { data: captured })).ok(),
  ).toBe(true);
  expect(await db.cardProject.count({ where: { id } })).toBe(1);
  await page.reload();
  await expect(
    page.getByLabel("Caption (optional)", { exact: true }),
  ).toHaveValue("Private project caption");
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  const journal = async (bookId: string) =>
    (await page.request.get(`/api/library/${bookId}/journal`)).json();
  expect(
    (await journal(one.id)).cardProjects.map((p: { id: string }) => p.id),
  ).toEqual([id]);
  expect((await journal(two.id)).cardProjects).toEqual([]);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.cardProjects[0].caption).toBe("Private project caption");
  expect(exported.cardProjects[0].books[0].workId).toBe(first.id);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, "project-other");
  // A streamed Next.js not-found page may already have sent HTTP 200.
  await otherPage.goto(`/creator/cards?project=${id}`);
  await expect(
    otherPage.getByText("This page could not be found.", { exact: true }),
  ).toBeVisible();
  await expect(
    otherPage.getByLabel("Project name", { exact: true }),
  ).toHaveCount(0);
  expect(await otherPage.locator("body").innerText()).not.toContain(
    "Private project caption",
  );
  expect(
    (
      await otherPage.request.patch("/api/card-projects", {
        data: { ...captured, version: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await otherPage.request.patch("/api/card-projects", {
        data: { ...captured, id: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await (await otherPage.request.get("/api/library/export")).json())
      .cardProjects,
  ).toEqual([]);
  await otherContext.close();
  expect(
    (
      await page.request.patch("/api/card-projects", {
        data: captured,
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  // Another tab updates the original; this tab must keep its unsaved text.
  const update = {
    ...captured,
    version: 1,
    project: { ...captured.project, caption: "Other tab" },
  };
  expect(
    (await page.request.patch("/api/card-projects", { data: update })).ok(),
  ).toBe(true);
  await page
    .getByLabel("Caption (optional)", { exact: true })
    .fill("Retained conflicting draft");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Save card project" }).getByRole("alert"),
  ).toContainText("changed or was deleted");
  await expect(
    page.getByLabel("Caption (optional)", { exact: true }),
  ).toHaveValue("Retained conflicting draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByLabel("Caption (optional)", { exact: true }),
  ).toHaveValue("Other tab");
  await page
    .getByRole("combobox", { name: "Card type" })
    .selectOption("shelfie");
  await page
    .getByRole("button", { name: `${first.title} / A. Reader`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `${second.title} / A. Reader`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `Move ${second.title} up`, exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Project saved privately" }),
  ).toBeVisible();
  await page.reload();
  const selected = page.getByRole("list", { name: "Selected books" });
  await expect(selected.getByRole("listitem").first()).toContainText(
    second.title,
  );
  expect(
    (await journal(two.id)).cardProjects.map((p: { id: string }) => p.id),
  ).toEqual([id]);
  await page
    .getByRole("button", { name: `Remove ${first.title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Project saved privately" }),
  ).toBeVisible();
  expect((await journal(one.id)).cardProjects).toEqual([]);
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep project", exact: true }).click();
  expect(
    (await db.cardProject.findUniqueOrThrow({ where: { id } })).deletedAt,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete project", exact: true })
    .click();
  await expect(page).toHaveURL("/creator/cards/projects");
  expect((await journal(two.id)).cardProjects).toEqual([]);
  expect(
    (await (await page.request.get("/api/library/export")).json()).cardProjects,
  ).toEqual([]);
  expect(
    (
      await page.request.patch("/api/card-projects", { data: captured })
    ).status(),
  ).toBe(409);
  const tombstone = await db.cardProject.findUniqueOrThrow({
    where: { id },
    include: { books: true },
  });
  expect(tombstone.caption).toBe("");
  expect(tombstone.title).toBe("");
  expect(tombstone.books).toHaveLength(0);
  expect(
    (await db.userBook.findUniqueOrThrow({ where: { id: two.id } }))
      .privateNotes,
  ).toBe("PRIVATE_LIBRARY_NOTES");
});

test("project directory paginates and account deletion removes saved designs without deleting works", async ({
  page,
}) => {
  const owner = await login(page, "project-pages");
  const work = await add(owner.id, `Card ${stamp} Retained project book`);
  const copy = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const project = {
    title: "Retained design",
    kind: "quote",
    format: "portrait",
    theme: "night",
    caption: "",
    quote: "A private quotation",
    reference: "p. 7",
    heading: "",
    includeByline: true,
    books: [{ workId: work.id, editionId: copy.editionId }],
  };
  const id = crypto.randomUUID();
  const request = { action: "save", id, version: 0, project };
  expect(
    (await page.request.patch("/api/card-projects", { data: request })).ok(),
  ).toBe(true);
  await db.userBook.delete({ where: { id: copy.id } });
  expect(
    (
      await page.request.patch("/api/card-projects", {
        data: {
          ...request,
          version: 1,
          project: { ...project, reference: "p. 8" },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/creator/cards?project=${id}`);
  await expect(page.getByLabel("Quote", { exact: true })).toHaveValue(
    "A private quotation",
  );
  await expect(page.getByLabel("Page or reference (optional)")).toHaveValue(
    "p. 8",
  );
  const additional = Array.from({ length: 21 }, (_, i) => ({
    id: crypto.randomUUID(),
    userId: owner.id,
    title: `Project ${i}`,
    kind: "book",
    format: "square",
    theme: "paper",
  }));
  await db.cardProject.createMany({ data: additional });
  await page.goto("/creator/cards/projects");
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(
    (
      await page.request.post("/api/settings/account", {
        data: {
          action: "delete",
          currentPassword: password,
          confirmation: "DELETE",
        },
      })
    ).ok(),
  ).toBe(true);
  expect(await db.cardProject.count({ where: { userId: owner.id } })).toBe(0);
  expect(await db.cardProjectBook.count({ where: { projectId: id } })).toBe(0);
  expect(await db.work.findUnique({ where: { id: work.id } })).not.toBeNull();
});
