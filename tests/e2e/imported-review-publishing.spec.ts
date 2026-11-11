import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const stamp = Date.now();
const email = `imported-review-${stamp}@example.test`;
const password = "imported-review-password";
const title = `Imported review ${stamp}`;
const importedText = "PRIVATE_IMPORTED_REVIEW_FOR_EXPLICIT_COPY";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Import reviewer", email, password },
      })
    ).ok(),
  ).toBe(true);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password },
  });
  return db.user.findUniqueOrThrow({ where: { email } });
}

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.work.deleteMany({ where: { title } });
  await db.$disconnect();
});

test("imported review text requires an explicit editable private draft copy", async ({
  page,
}) => {
  const user = await login(page);
  const work = await db.work.create({
    data: {
      title,
      authorName: "Import Author",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "paperback",
          userBooks: {
            create: {
              userId: user.id,
              shelf: "read",
              rating: 5,
              importedReview: importedText,
            },
          },
        },
      },
    },
  });

  await page.goto(`/community/review/${work.id}`);
  const review = page
    .getByRole("main")
    .last()
    .getByRole("textbox", { name: "Review", exact: true });
  await expect(review).toHaveValue("");
  await expect(
    page.getByLabel("Publish this review and its rating", { exact: false }).last(),
  ).not.toBeChecked();
  expect(
    await db.bookReview.count({ where: { userId: user.id, workId: work.id } }),
  ).toBe(0);

  await page
    .getByRole("button", { name: "Copy imported review into draft" })
    .last()
    .click();
  await expect(review).toHaveValue(importedText);
  expect(
    await db.bookReview.count({ where: { userId: user.id, workId: work.id } }),
  ).toBe(0);

  await review.fill("Existing community draft");
  await page
    .getByRole("button", { name: "Copy imported review into draft" })
    .last()
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Replace community draft text?",
  });
  await confirm.getByRole("button", { name: "Keep current draft" }).click();
  await expect(review).toHaveValue("Existing community draft");
  await page
    .getByRole("button", { name: "Copy imported review into draft" })
    .last()
    .click();
  await confirm.getByRole("button", { name: "Replace draft text" }).click();
  await expect(review).toHaveValue(importedText);
  await page.getByRole("button", { name: "Save review" }).last().click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }).last(),
  ).toBeVisible();

  const saved = await db.bookReview.findFirstOrThrow({
    where: { userId: user.id, workId: work.id, active: true },
  });
  expect(saved.body).toBe(importedText);
  expect(saved.rating).toBeNull();
  expect(saved.isPublic).toBe(false);
  const privateCopy = await db.userBook.findFirstOrThrow({
    where: { userId: user.id, edition: { workId: work.id } },
  });
  expect(privateCopy.importedReview).toBe(importedText);
  expect(privateCopy.rating).toBe(5);
});
