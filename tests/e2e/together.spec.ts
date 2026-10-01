import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "together-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `together-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `together-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `TogetherBook ${stamp}` } },
  });
  await db.$disconnect();
});

async function invite(page: Page, id: string) {
  const d = await (
    await page.request.patch(`/api/clubs/${id}`, {
      data: { action: "invite", version: 0 },
    })
  ).json();
  return d.invite as string;
}
async function join(
  page: Page,
  id: string,
  code: string,
  alias: string,
  membershipVersion: number | null = null,
) {
  return page.request.patch(`/api/clubs/${id}`, {
    data: {
      action: "join",
      version: 1,
      membershipVersion,
      alias,
      invite: code,
    },
  });
}
test("Reading Together shares schedules and chosen posts while preserving journals and fixed partners", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  const work = await add(owner.id, `TogetherBook ${stamp} shared`);
  const ownerBook = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await page.goto("/community/together");
  await page.getByRole("button", { name: "Start Reading Together" }).click();
  await page
    .getByLabel("Reading pair name", { exact: true })
    .fill("Two readers");
  await page
    .getByLabel("Your club display name", { exact: true })
    .fill("Reader one");
  await expect(
    page.getByLabel("List as an open club anyone signed in can join"),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save reading pair" }).click();
  await expect(page).toHaveURL(/community\/clubs\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!,
    url = `/api/clubs/${id}`,
    code = await invite(page, id);
  const ctx = await browser.newContext(),
    partnerPage = await ctx.newPage(),
    partner = await login(partnerPage, "partner");
  const partnerBook = await db.userBook.create({
    data: {
      userId: partner.id,
      editionId: ownerBook.editionId,
      shelf: "tbr",
      privateNotes: "PARTNER_PRIVATE_NOTE",
    },
  });
  expect((await partnerPage.request.get(url)).status()).toBe(404);
  expect(
    await (await partnerPage.request.get("/api/clubs?mine=false")).text(),
  ).not.toContain("Two readers");
  await partnerPage.goto("/community/together");
  await partnerPage.getByLabel("Invitation code", { exact: true }).fill(code);
  await partnerPage.getByRole("button", { name: "Check invitation" }).click();
  await expect(
    partnerPage.getByText(/Joining reserves the partner place/),
  ).toBeVisible();
  await partnerPage
    .getByLabel("Your club display name", { exact: true })
    .fill("Reader two");
  await partnerPage.getByRole("button", { name: "Join invited club" }).click();
  await expect(partnerPage).toHaveURL(new RegExp(`/community/clubs/${id}$`));
  await partnerPage
    .getByRole("button", { name: "Suggest a shared reading" })
    .click();
  const form = partnerPage.getByRole("form", { name: "Schedule club reading" });
  await form.getByLabel("Book from your library").selectOption(work.id);
  await form.getByLabel("Finish by (optional)").fill("2026-12-01");
  await form.getByRole("button", { name: "Save reading schedule" }).click();
  await expect(
    partnerPage.getByRole("region", { name: "Club readings" }),
  ).toContainText("2026-12-01");
  await partnerPage
    .getByRole("button", { name: "Edit schedule", exact: true })
    .click();
  await form.getByLabel("Finish by (optional)").fill("2026-12-15");
  await form.getByRole("button", { name: "Save reading schedule" }).click();
  await expect(
    partnerPage.getByRole("region", { name: "Club readings" }),
  ).toContainText("2026-12-15");
  await expect(
    partnerPage.getByRole("button", { name: "Remove reading", exact: true }),
  ).toHaveCount(0);
  const reading = await db.bookClubReading.findFirstOrThrow({
    where: { clubId: id },
  });
  await partnerPage
    .getByRole("button", { name: "Write a discussion post" })
    .click();
  await partnerPage
    .getByRole("textbox", { name: "Your discussion post", exact: true })
    .fill("PARTNER_SHARED_THOUGHT");
  await partnerPage
    .getByRole("button", { name: "Share with club", exact: true })
    .click();
  await expect(
    partnerPage.getByRole("article", { name: "Club post" }),
  ).toContainText("PARTNER_SHARED_THOUGHT");
  expect(
    (
      await page.request.patch(url, {
        data: {
          action: "post",
          id: crypto.randomUUID(),
          version: 0,
          readingId: reading.id,
          body: "OWNER_SHARED_THOUGHT",
          spoilerPage: 20,
        },
      })
    ).status(),
  ).toBe(200);
  const memberResponse = await (await partnerPage.request.get(url)).text();
  expect(memberResponse).not.toContain("PRIVATE_LIBRARY_NOTES");
  expect(memberResponse).not.toContain(owner.email!);
  const ownJournal = await (
    await page.request.get(`/api/library/${ownerBook.id}/journal`)
  ).text();
  expect(ownJournal).toContain("OWNER_SHARED_THOUGHT");
  expect(ownJournal).not.toContain("PARTNER_SHARED_THOUGHT");
  const partnerJournal = await (
    await partnerPage.request.get(`/api/library/${partnerBook.id}/journal`)
  ).text();
  expect(partnerJournal).toContain("PARTNER_SHARED_THOUGHT");
  expect(partnerJournal).not.toContain("OWNER_SHARED_THOUGHT");
  const exported=await (await partnerPage.request.get("/api/library/export")).text();
  expect(exported).toContain("PARTNER_SHARED_THOUGHT");
  expect(exported).not.toContain("OWNER_SHARED_THOUGHT");
  await partnerPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await partnerPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await partnerPage.screenshot({
    path: "test-results/reading-together-mobile.png",
  });
  expect(
    (
      await partnerPage.request.patch(url, {
        data: { action: "leave", version: 0 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await (
        await partnerPage.request.get(`/api/library/${partnerBook.id}/journal`)
      ).json()
    ).clubPosts,
  ).toEqual([]);
  const thirdContext = await browser.newContext(),
    third = await thirdContext.newPage();
  await login(third, "third");
  expect(
    (
      await third.request.post("/api/clubs/invite", { data: { invite: code } })
    ).status(),
  ).toBe(404);
  expect((await join(third, id, code, "Third reader")).status()).toBe(409);
  expect((await join(partnerPage, id, code, "Reader two", null)).status()).toBe(
    409,
  );
  expect((await join(partnerPage, id, code, "Reader two", 1)).status()).toBe(
    200,
  );
  expect(
    (
      await page.request.patch(url, {
        data: { action: "removeMember", userId: partner.id, version: 2 },
      })
    ).status(),
  ).toBe(200);
  expect((await join(partnerPage, id, code, "Reader two", 3)).status()).toBe(
    403,
  );
  expect((await join(third, id, code, "Third reader")).status()).toBe(409);
  expect(
    await db.userBook.count({
      where: {
        id: partnerBook.id,
        shelf: "tbr",
        shelfPinned: false,
        privateNotes: "PARTNER_PRIVATE_NOTE",
      },
    }),
  ).toBe(1);
  await thirdContext.close();
  await ctx.close();
});
test("simultaneous partner joins reserve one seat and pairs cannot become public or replace deleted accounts", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "raceowner");
  const id = crypto.randomUUID(),
    payload = {
      id,
      name: "Fixed pair",
      description: "Private",
      alias: "Owner",
      isPublic: false,
      isPair: true,
    };
  expect(
    (
      await page.request.post("/api/clubs", {
        data: { ...payload, isPublic: true },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await page.request.post("/api/clubs", { data: payload })).status(),
  ).toBe(200);
  expect(
    (await page.request.post("/api/clubs", { data: payload })).status(),
  ).toBe(200);
  const code = await invite(page, id);
  const a = await browser.newContext(),
    b = await browser.newContext(),
    ap = await a.newPage(),
    bp = await b.newPage();
  const au = await login(ap, "racea"),
    bu = await login(bp, "raceb");
  const results = await Promise.all([
    join(ap, id, code, "A"),
    join(bp, id, code, "B"),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const club = await db.bookClub.findUniqueOrThrow({ where: { id } });
  expect(
    await db.bookClubMember.count({ where: { clubId: id, active: true } }),
  ).toBe(2);
  expect([au.id, bu.id]).toContain(club.partnerId);
  expect(
    (
      await page.request.patch(`/api/clubs/${id}`, {
        data: {
          action: "update",
          version: 1,
          name: "Fixed pair",
          description: "",
          isPublic: true,
        },
      })
    ).status(),
  ).toBe(400);
  const winner = club.partnerId === au.id ? au : bu,
    loserPage = club.partnerId === au.id ? bp : ap;
  await db.user.delete({ where: { id: winner.id } });
  expect((await join(loserPage, id, code, "Replacement")).status()).toBe(409);
  expect(
    (
      await loserPage.request.post("/api/clubs/invite", {
        data: { invite: code },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch(`/api/clubs/${id}`, {
        data: { action: "delete", version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.post("/api/clubs", { data: payload })).status(),
  ).toBe(409);
  expect((await join(loserPage, id, code, "Replacement")).status()).toBe(404);
  await a.close();
  await b.close();
  await db.user.delete({ where: { id: owner.id } });
  expect(await db.bookClub.count({ where: { id } })).toBe(0);
});
