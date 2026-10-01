import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "clubs-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `clubs-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `clubs-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `ClubBook ${stamp}` } },
  });
  await db.$disconnect();
});

test("private clubs support scheduled reading and discussion with live, owner-only bookshelf journal links", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  await add(owner.id, `ClubBook ${stamp} Shared novel`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
    include: { edition: { include: { work: true } } },
  });
  await page.goto("/community/clubs");
  await page
    .getByRole("button", { name: "Create a club", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Create book club" });
  await form
    .getByLabel("Club name", { exact: true })
    .fill("Private reading circle");
  await form
    .getByLabel("Description", { exact: true })
    .fill("PRIVATE_CLUB_DESCRIPTION");
  await form
    .getByLabel("Your club display name", { exact: true })
    .fill("Owner alias");
  await form.getByRole("button", { name: "Save new club" }).click();
  await expect(page).toHaveURL(/community\/clubs\/[a-f0-9-]+$/);
  const clubId = page.url().split("/").at(-1)!;
  const url = `/api/clubs/${clubId}`;
  await page
    .getByRole("button", { name: "Add club reading", exact: true })
    .click();
  const schedule = page.getByRole("form", { name: "Schedule club reading" });
  await schedule
    .getByLabel("Book from your library")
    .selectOption(book.edition.workId);
  await schedule
    .getByLabel("Start date (optional)", { exact: true })
    .fill("2026-10-01");
  await schedule
    .getByLabel("Finish by (optional)", { exact: true })
    .fill("2026-10-15");
  await schedule.getByRole("button", { name: "Save reading schedule" }).click();
  await expect(
    page.getByRole("region", { name: "Club readings", exact: true }),
  ).toContainText("2026-10-15");
  const reading = await db.bookClubReading.findFirstOrThrow({
    where: { clubId },
  });
  await page
    .getByRole("button", { name: "Generate invitation code", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Confirm club action" })
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  const code = (await page
    .getByRole("region", { name: "Club invitation" })
    .locator("code")
    .textContent())!;
  expect(code).toMatch(/^[a-f0-9]{64}$/);
  const memberPage = await browser.newPage();
  const member = await login(memberPage, "member");
  const memberBook = await db.userBook.create({
    data: {
      userId: member.id,
      editionId: book.editionId,
      shelf: "tbr",
      privateNotes: "MEMBER_PRIVATE_NOTE",
    },
  });
  expect((await memberPage.request.get(url)).status()).toBe(404);
  const publicList = await (
    await memberPage.request.get("/api/clubs?mine=false")
  ).text();
  expect(publicList).not.toContain("PRIVATE_CLUB_DESCRIPTION");
  await memberPage.goto("/community/clubs");
  await memberPage.getByLabel("Invitation code", { exact: true }).fill(code);
  await memberPage.getByRole("button", { name: "Check invitation" }).click();
  await memberPage
    .getByLabel("Your club display name", { exact: true })
    .fill("Member alias");
  await memberPage.getByRole("button", { name: "Join invited club" }).click();
  await expect(memberPage).toHaveURL(new RegExp(`/community/clubs/${clubId}$`));
  await memberPage
    .getByRole("button", { name: "Write a discussion post" })
    .click();
  await memberPage
    .getByRole("textbox", { name: "Your discussion post", exact: true })
    .fill("MEMBER_ONLY_THOUGHT");
  await memberPage
    .getByRole("button", { name: "Share with club", exact: true })
    .click();
  await expect(
    memberPage.getByRole("article", { name: "Club post" }),
  ).toContainText("MEMBER_ONLY_THOUGHT");
  await page.getByRole("button", { name: "Write a discussion post" }).click();
  const text = page.getByRole("textbox", {
    name: "Your discussion post",
    exact: true,
  });
  await text.fill("OWNER_ONLY_THOUGHT");
  await expect(
    page.getByRole("button", { name: "Add club reading", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Spoilers through page (optional)", { exact: true })
    .fill("50");
  await page.route(`**/api/clubs/${clubId}`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        json: { error: "Temporary club failure" },
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Share with club", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary club failure" }),
  ).toContainText("Temporary club failure");
  await expect(text).toHaveValue("OWNER_ONLY_THOUGHT");
  await page.unroute(`**/api/clubs/${clubId}`);
  await page
    .getByRole("button", { name: "Share with club", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Write a discussion post" }),
  ).toBeVisible();
  await expect(
    page.getByText("OWNER_ONLY_THOUGHT", { exact: true }),
  ).not.toBeVisible();
  await page.getByText("Spoilers through page 50", { exact: true }).click();
  await expect(
    page.getByText("OWNER_ONLY_THOUGHT", { exact: true }),
  ).toBeVisible();
  const ownPost = await db.bookClubPost.findFirstOrThrow({
    where: { userId: owner.id, readingId: reading.id },
  });
  expect(
    (
      await page.request.patch(url, {
        data: {
          action: "post",
          id: ownPost.id,
          readingId: reading.id,
          body: ownPost.body,
          spoilerPage: 50,
          version: 0,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    await db.bookClubPost.count({
      where: { readingId: reading.id, userId: owner.id },
    }),
  ).toBe(1);
  await page.getByRole("button", { name: "Edit post", exact: true }).click();
  await text.fill("MY_STALE_DRAFT");
  expect(
    (
      await page.request.patch(url, {
        data: {
          action: "post",
          id: ownPost.id,
          readingId: reading.id,
          body: "CORRECTED_OWNER_THOUGHT",
          spoilerPage: null,
          version: 0,
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Share with club", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toContainText("changed elsewhere");
  await expect(text).toHaveValue("MY_STALE_DRAFT");
  await page.goto(`/library/book/${book.id}`);
  const journal = page.getByRole("region", { name: "Your book club activity" });
  await expect(journal).toContainText("CORRECTED_OWNER_THOUGHT");
  await expect(journal).not.toContainText("MEMBER_ONLY_THOUGHT");
  const memberJournal = await (
    await memberPage.request.get(`/api/library/${memberBook.id}/journal`)
  ).json();
  expect(memberJournal.clubPosts.map((p: { body: string }) => p.body)).toEqual([
    "MEMBER_ONLY_THOUGHT",
  ]);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.clubPosts.map((p: { body: string }) => p.body)).toEqual([
    "CORRECTED_OWNER_THOUGHT",
  ]);
  expect(JSON.stringify(exported.clubPosts)).not.toContain(
    "MEMBER_ONLY_THOUGHT",
  );
  expect(
    (await db.userBook.findUniqueOrThrow({ where: { id: memberBook.id } }))
      .shelfPinned,
  ).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await journal.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/club-journal-mobile.png" });
  await page.goto(`/community/clubs/${clubId}`);
  await expect(
    page.getByRole("region", { name: "Club discussion" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/book-club-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("article", { name: "Club post" })
    .filter({ hasText: "CORRECTED_OWNER_THOUGHT" })
    .getByRole("button", { name: "Delete post", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Confirm club action" })
    .getByRole("button", { name: "Cancel action" })
    .click();
  expect(
    await db.bookClubPost.count({ where: { id: ownPost.id, deletedAt: null } }),
  ).toBe(1);
  await page
    .getByRole("article", { name: "Club post" })
    .filter({ hasText: "CORRECTED_OWNER_THOUGHT" })
    .getByRole("button", { name: "Delete post", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Confirm club action" })
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page.getByText("CORRECTED_OWNER_THOUGHT", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.patch(url, {
        data: {
          action: "post",
          id: ownPost.id,
          readingId: reading.id,
          body: ownPost.body,
          spoilerPage: 50,
          version: 0,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await (await page.request.get(`/api/library/${book.id}/journal`)).json())
      .clubPosts,
  ).toHaveLength(0);
  const m = await db.bookClubMember.findUniqueOrThrow({
    where: { clubId_userId: { clubId, userId: member.id } },
  });
  expect(
    (
      await memberPage.request.patch(url, {
        data: { action: "leave", version: m.version },
      })
    ).status(),
  ).toBe(200);
  expect((await memberPage.request.get(url)).status()).toBe(404);
  const afterLeave = await (
    await memberPage.request.get(`/api/library/${memberBook.id}/journal`)
  ).json();
  expect(afterLeave.clubPosts).toHaveLength(0);
  expect(afterLeave.clubReadings).toHaveLength(0);
  expect(
    (await db.userBook.findUniqueOrThrow({ where: { id: memberBook.id } }))
      .privateNotes,
  ).toBe("MEMBER_PRIVATE_NOTE");
  await memberPage.close();
});

test("club invites, open discovery and membership versions prevent access and replay after removal", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "lifecycle");
  await add(owner.id, `ClubBook ${stamp} Lifecycle`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
    include: { edition: true },
  });
  const id = crypto.randomUUID(),
    create = {
      id,
      name: "Open reading circle",
      description: "ONLY_CLUB_DESCRIPTION",
      isPublic: true,
      alias: "Owner club alias",
    };
  expect(
    (await page.request.post("/api/clubs", { data: create })).status(),
  ).toBe(200);
  expect(
    (await page.request.post("/api/clubs", { data: create })).status(),
  ).toBe(200);
  const url = `/api/clubs/${id}`;
  const other = await browser.newPage();
  const reader = await login(other, "outsider");
  const summary = await (await other.request.get(url)).json();
  expect(summary.club.name).toBe(create.name);
  expect(summary.members).toHaveLength(0);
  expect(summary.posts).toHaveLength(0);
  expect(summary.readings).toHaveLength(0);
  expect(JSON.stringify(summary)).not.toContain("Owner club alias");
  const join = {
    action: "join",
    version: 0,
    membershipVersion: null,
    alias: "Reader alias",
  };
  const joined = await Promise.all([
    other.request.patch(url, { data: join }),
    other.request.patch(url, { data: join }),
  ]);
  expect(joined.map((r) => r.status())).toEqual([200, 200]);
  expect(
    await db.bookClubMember.count({ where: { clubId: id, userId: reader.id } }),
  ).toBe(1);
  const readingId = crypto.randomUUID();
  const reading = {
    action: "reading",
    id: readingId,
    version: 0,
    workId: book.edition.workId,
    startsOn: "2026-10-01",
    endsOn: "2026-10-10",
  };
  expect((await other.request.patch(url, { data: reading })).status()).toBe(
    403,
  );
  expect(
    (
      await page.request.patch(url, {
        data: { ...reading, endsOn: "2026-09-01" },
      })
    ).status(),
  ).toBe(400);
  expect((await page.request.patch(url, { data: reading })).status()).toBe(200);
  expect((await page.request.patch(url, { data: reading })).status()).toBe(200);
  expect(await db.bookClubReading.count({ where: { clubId: id } })).toBe(1);
  expect(
    (
      await other.request.patch(url, { data: { action: "leave", version: 0 } })
    ).status(),
  ).toBe(200);
  expect((await other.request.patch(url, { data: join })).status()).toBe(409);
  expect(
    (
      await other.request.patch(url, {
        data: { ...join, membershipVersion: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(url, {
        data: { action: "removeMember", userId: reader.id, version: 2 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await other.request.patch(url, {
        data: { ...join, membershipVersion: 3 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await other.request.patch(url, {
        data: {
          action: "post",
          id: crypto.randomUUID(),
          readingId,
          version: 0,
          body: "DENIED_POST",
          spoilerPage: null,
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch(url, {
        data: {
          action: "update",
          version: 0,
          name: create.name,
          description: create.description,
          isPublic: false,
        },
      })
    ).status(),
  ).toBe(200);
  expect((await other.request.get(url)).status()).toBe(404);
  const first = await (
    await page.request.patch(url, { data: { action: "invite", version: 1 } })
  ).json();
  expect(first.invite).toHaveLength(64);
  const third = await browser.newPage();
  await login(third, "invited");
  expect(
    (
      await third.request.post("/api/clubs/invite", {
        data: { invite: first.invite },
      })
    ).status(),
  ).toBe(200);
  const second = await (
    await page.request.patch(url, { data: { action: "invite", version: 2 } })
  ).json();
  expect(second.invite).not.toBe(first.invite);
  expect(
    (
      await third.request.post("/api/clubs/invite", {
        data: { invite: first.invite },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await third.request.patch(url, {
        data: {
          action: "join",
          version: 3,
          membershipVersion: null,
          alias: "Invited alias",
          invite: first.invite,
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch(url, {
        data: { action: "revokeInvite", version: 3 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await third.request.post("/api/clubs/invite", {
        data: { invite: second.invite },
      })
    ).status(),
  ).toBe(404);
  const postId = crypto.randomUUID();
  expect(
    (
      await page.request.patch(url, {
        data: {
          action: "post",
          id: postId,
          readingId,
          body: "REMOVE_WITH_READING",
          spoilerPage: null,
          version: 0,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(url, {
        data: { action: "removeReading", id: readingId, version: 0 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await db.bookClubPost.findUniqueOrThrow({ where: { id: postId } })).body,
  ).toBe("");
  expect((await page.request.patch(url, { data: reading })).status()).toBe(409);
  expect(
    (
      await page.request.patch(url, { data: { action: "delete", version: 4 } })
    ).status(),
  ).toBe(200);
  expect((await page.request.get(url)).status()).toBe(404);
  expect(
    (await page.request.post("/api/clubs", { data: create })).status(),
  ).toBe(409);
  expect(await db.userBook.count({ where: { id: book.id } })).toBe(1);
  await other.close();
  await third.close();
});

test("club pagination and account deletion keep shared data scoped and preserve other readers", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "cascadeowner");
  await add(owner.id, `ClubBook ${stamp} Cascade`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
    include: { edition: true },
  });
  const other = await browser.newPage();
  const member = await login(other, "cascademember");
  const memberBook = await db.userBook.create({
    data: { userId: member.id, editionId: book.editionId, shelf: "tbr" },
  });
  const clubId = crypto.randomUUID(),
    readingId = crypto.randomUUID();
  await db.bookClub.create({
    data: {
      id: clubId,
      ownerId: owner.id,
      name: "Cascade club",
      members: {
        create: [
          { userId: owner.id, alias: "Owner alias" },
          { userId: member.id, alias: "Member alias" },
        ],
      },
      readings: { create: { id: readingId, workId: book.edition.workId } },
    },
  });
  await db.bookClubPost.createMany({
    data: [
      ...Array.from({ length: 55 }, (_, i) => ({
        id: crypto.randomUUID(),
        readingId,
        userId: owner.id,
        authorAlias: "Owner alias",
        body: `Owner thought ${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })),
      {
        id: crypto.randomUUID(),
        readingId,
        userId: member.id,
        authorAlias: "Member alias",
        body: "MEMBER_CASCADE_THOUGHT",
        createdAt: new Date("2026-01-02"),
      },
    ],
  });
  const url = `/api/clubs/${clubId}`;
  const first = await (await page.request.get(url)).json();
  expect(first.posts).toHaveLength(20);
  expect(first.morePosts).toBe(true);
  const second = await (await page.request.get(`${url}?postsPage=1`)).json();
  expect(second.posts).toHaveLength(20);
  expect(second.posts[0].id).not.toBe(first.posts[0].id);
  const journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(journal.clubPosts).toHaveLength(50);
  expect(journal.hasMore).toBe(true);
  expect(JSON.stringify(journal.clubPosts)).not.toContain(
    "MEMBER_CASCADE_THOUGHT",
  );
  const more = await (
    await page.request.get(`/api/library/${book.id}/journal?page=1`)
  ).json();
  expect(more.clubPosts).toHaveLength(5);
  const exported = await (
    await other.request.get("/api/library/export")
  ).json();
  expect(exported.clubPosts).toHaveLength(1);
  expect(exported.clubPosts[0].body).toBe("MEMBER_CASCADE_THOUGHT");
  expect(
    (
      await other.request.post("/api/settings/account", {
        data: {
          action: "delete",
          currentPassword: password,
          confirmation: "DELETE",
        },
      })
    ).status(),
  ).toBe(200);
  expect(await db.bookClubPost.count({ where: { userId: member.id } })).toBe(0);
  expect(await db.bookClubMember.count({ where: { userId: member.id } })).toBe(
    0,
  );
  expect(await db.userBook.count({ where: { id: memberBook.id } })).toBe(0);
  expect(await db.bookClub.count({ where: { id: clubId } })).toBe(1);
  expect(await db.bookClubPost.count({ where: { userId: owner.id } })).toBe(55);
  expect(
    (
      await page.request.post("/api/settings/account", {
        data: {
          action: "delete",
          currentPassword: password,
          confirmation: "DELETE",
        },
      })
    ).status(),
  ).toBe(200);
  expect(await db.bookClub.count({ where: { id: clubId } })).toBe(0);
  expect(await db.bookClubReading.count({ where: { id: readingId } })).toBe(0);
  expect(await db.bookClubPost.count({ where: { readingId } })).toBe(0);
  expect(await db.work.count({ where: { id: book.edition.workId } })).toBe(1);
  await other.close();
});
