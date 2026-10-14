import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const stamp = Date.now();
const password = "boards-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `boards-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `boards-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `BoardBook ${stamp}` } },
  });
  await db.$disconnect();
});

function post(
  workId: string,
  parentId: string | null = null,
  spoilers = false,
) {
  return {
    action: "post",
    id: crypto.randomUUID(),
    workId,
    parentId,
    title: parentId ? "" : "A book question",
    body: "A shared thought",
    alias: "Chosen reader",
    spoilers,
    version: 0,
  };
}
test("book discussions preserve spoiler controls, drafts, own journals and private moderation reports", async ({
  page,
  browser,
}) => {
  const owner = await login(page, "owner");
  const work = await add(owner.id, `BoardBook ${stamp} shared`);
  const ownerBook = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await page.goto(`/community/discussions?work=${work.id}`);
  await page.getByRole("button", { name: "Start a discussion" }).click();
  await page.getByLabel("Discussion title").fill("Thoughts on the ending");
  await page.getByLabel("Discussion display name").fill("Reader one");
  await page.getByLabel("Your post", { exact: true }).fill("OWNER_SPOILER");
  await page.getByLabel("Allow spoilers in this discussion").check();
  await page.getByRole("button", { name: "Publish post", exact: true }).click();
  await expect(page).toHaveURL(/community\/discussions\/[a-f0-9-]+$/);
  const threadId = page.url().split("/").at(-1)!;
  await expect(
    page.getByText("OWNER_SPOILER", { exact: true }),
  ).not.toBeVisible();
  await page.getByText("Reveal spoiler content", { exact: true }).click();
  await expect(page.getByText("OWNER_SPOILER", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit post", exact: true }).click();
  await page.getByLabel("Your post", { exact: true }).fill("OWNER_EDITED");
  await page.route("**/api/discussions", async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary discussion failure" }),
    }),
  );
  await page.getByRole("button", { name: "Save post changes" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary discussion failure" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your post", { exact: true })).toHaveValue(
    "OWNER_EDITED",
  );
  await page.unroute("**/api/discussions");
  await page.getByRole("button", { name: "Save post changes" }).click();
  await expect(page.getByLabel("Your post", { exact: true })).toHaveCount(0);
  const ctx = await browser.newContext(),
    readerPage = await ctx.newPage(),
    reader = await login(readerPage, "reader");
  const readerBook = await db.userBook.create({
    data: {
      userId: reader.id,
      editionId: ownerBook.editionId,
      shelf: "tbr",
      privateNotes: "READER_PRIVATE_NOTE",
    },
  });
  await readerPage.goto(`/community/discussions/${threadId}`);
  await readerPage.getByRole("button", { name: "Write a reply" }).click();
  await readerPage.getByLabel("Discussion display name").fill("Reader two");
  await readerPage
    .getByLabel("Your post", { exact: true })
    .fill("READER_REPLY");
  await readerPage
    .getByRole("button", { name: "Publish post", exact: true })
    .click();
  await expect(
    readerPage.getByRole("article", { name: "Discussion contribution" }),
  ).toHaveCount(2);
  await expect(
    readerPage.getByText("READER_REPLY", { exact: true }),
  ).not.toBeVisible();
  const response = await (
    await readerPage.request.get(`/api/discussions?thread=${threadId}`)
  ).text();
  expect(response).not.toContain(owner.email!);
  expect(response).not.toContain("PRIVATE_LIBRARY_NOTES");
  expect(response).not.toContain("userId");
  expect(
    await (
      await readerPage.request.get(`/api/discussions?work=${work.id}`)
    ).text(),
  ).not.toContain("OWNER_EDITED");
  const ownerJournal = await (
    await page.request.get(`/api/library/${ownerBook.id}/journal`)
  ).text();
  expect(ownerJournal).toContain("OWNER_EDITED");
  expect(ownerJournal).not.toContain("READER_REPLY");
  await page.goto(`/library/book/${ownerBook.id}`);
  await expect(
    page
      .getByRole("region", { name: "Your community discussions" })
      .getByRole("link", { name: "Thoughts on the ending" }),
  ).toBeVisible();
  const readerJournal = await (
    await readerPage.request.get(`/api/library/${readerBook.id}/journal`)
  ).text();
  expect(readerJournal).toContain("READER_REPLY");
  expect(readerJournal).not.toContain("OWNER_EDITED");
  const exported = await (
    await readerPage.request.get("/api/library/export")
  ).json();
  expect(exported.discussionPosts).toHaveLength(1);
  await readerPage
    .getByRole("article", { name: "Discussion contribution" })
    .first()
    .getByRole("button", { name: "Report post" })
    .click();
  await readerPage.getByLabel("Report reason").fill("PRIVATE_REPORT_REASON");
  await readerPage.getByRole("button", { name: "Submit report" }).click();
  await expect(
    readerPage.getByRole("status").filter({ hasText: "Report recorded" }),
  ).toBeVisible();
  expect(
    (await readerPage.request.get("/api/discussions/reports")).status(),
  ).toBe(403);
  expect(
    await (
      await page.request.get(`/api/discussions?thread=${threadId}`)
    ).text(),
  ).not.toContain("PRIVATE_REPORT_REASON");
  const modCtx = await browser.newContext(),
    modPage = await modCtx.newPage(),
    mod = await login(modPage, "moderator");
  await db.user.update({ where: { id: mod.id }, data: { isModerator: true } });
  const reports = await (
    await modPage.request.get("/api/discussions/reports")
  ).json();
  const report = reports.reports.find((r: any) => r.post.id === threadId);
  expect(report.reason).toBe("PRIVATE_REPORT_REASON");
  const root = await db.bookDiscussion.findUniqueOrThrow({
    where: { id: threadId },
  });
  const update = {
    action: "post",
    id: root.id,
    workId: root.workId,
    parentId: null,
    title: root.title,
    body: "OWNER_UPDATED_AGAIN",
    alias: root.alias,
    spoilers: true,
    version: root.version,
  };
  expect(
    (await page.request.patch("/api/discussions", { data: update })).status(),
  ).toBe(200);
  expect(
    (
      await modPage.request.patch("/api/discussions/reports", {
        data: { id: report.id, version: root.version, decision: "remove" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch("/api/discussions", {
        data: { ...update, body: "Stale overwrite" },
      })
    ).status(),
  ).toBe(409);
  await modPage.goto("/community/moderation/discussions");
  await modPage
    .getByRole("button", { name: "Remove reported content" })
    .click();
  await modPage.getByRole("button", { name: "Confirm moderation" }).click();
  await expect(
    modPage.getByText("No pending reports on this page."),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/discussions?thread=${threadId}`)).status(),
  ).toBe(404);
  expect(
    (await page.request.patch("/api/discussions", { data: update })).status(),
  ).toBe(409);
  expect(
    (
      await (
        await readerPage.request.get(`/api/library/${readerBook.id}/journal`)
      ).json()
    ).discussionPosts,
  ).toEqual([]);
  expect(
    (await (await readerPage.request.get("/api/library/export")).json())
      .discussionPosts,
  ).toEqual([]);
  expect(
    await db.userBook.count({
      where: { id: readerBook.id, shelf: "tbr", shelfPinned: false },
    }),
  ).toBe(1);
  await ctx.close();
  await modCtx.close();
});
test("discussion pagination, author deletion and account cascade preserve source ownership", async ({
  page,
  browser,
}) => {
  const user = await login(page, "pages");
  const work = await add(user.id, `BoardBook ${stamp} pagination`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: user.id },
  });
  const root = post(work.id);
  const retries = await Promise.all([
    page.request.patch("/api/discussions", { data: root }),
    page.request.patch("/api/discussions", { data: root }),
  ]);
  expect(retries.every((r) => r.ok())).toBe(true);
  expect(await db.bookDiscussion.count({ where: { id: root.id } })).toBe(1);
  expect(
    (
      await page.request.patch("/api/discussions", {
        data: { ...root, spoilers: true },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.patch("/api/discussions", {
        headers: { origin: "https://example.invalid" },
        data: post(work.id),
      })
    ).status(),
  ).toBe(403);
  await db.bookDiscussion.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      id: crypto.randomUUID(),
      workId: work.id,
      userId: user.id,
      parentId: root.id,
      title: "",
      body: `Own reply ${i}`,
      alias: "Reader",
    })),
  });
  const ctx = await browser.newContext(),
    otherPage = await ctx.newPage(),
    other = await login(otherPage, "other");
  const otherBook = await db.userBook.create({
    data: { userId: other.id, editionId: book.editionId, shelf: "tbr" },
  });
  const otherReply = post(work.id, root.id);
  expect(
    (
      await otherPage.request.patch("/api/discussions", { data: otherReply })
    ).status(),
  ).toBe(200);
  expect(
    (
      await otherPage.request.patch("/api/discussions", {
        data: { action: "delete", id: root.id, version: 0 },
      })
    ).status(),
  ).toBe(404);
  const first = await (
      await page.request.get(`/api/discussions?thread=${root.id}`)
    ).json(),
    second = await (
      await page.request.get(`/api/discussions?thread=${root.id}&page=1`)
    ).json();
  expect(first.posts).toHaveLength(20);
  expect(second.posts).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(
    first.posts.some((p: any) => second.posts.some((q: any) => q.id === p.id)),
  ).toBe(false);
  const journal1 = await (
      await page.request.get(`/api/library/${book.id}/journal`)
    ).json(),
    journal2 = await (
      await page.request.get(`/api/library/${book.id}/journal?page=1`)
    ).json();
  expect(journal1.discussionPosts).toHaveLength(50);
  expect(journal2.discussionPosts).toHaveLength(6);
  expect(journal1.hasMore).toBe(true);
  expect(
    (
      await (
        await otherPage.request.get(`/api/library/${otherBook.id}/journal`)
      ).json()
    ).discussionPosts,
  ).toHaveLength(1);
  await page.goto(`/community/discussions/${root.id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "A book question", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Discussion contribution" }).first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/discussion-mobile.png" });
  await page
    .getByRole("article", { name: "Discussion contribution" })
    .first()
    .getByRole("button", { name: "Delete post" })
    .click();
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  expect(
    (await page.request.get(`/api/discussions?thread=${root.id}`)).status(),
  ).toBe(200);
  await page
    .getByRole("article", { name: "Discussion contribution" })
    .first()
    .getByRole("button", { name: "Delete post" })
    .click();
  await page.getByRole("button", { name: "Confirm delete post" }).click();
  await expect(page).toHaveURL(/discussions\?work=/);
  expect(
    (await page.request.patch("/api/discussions", { data: root })).status(),
  ).toBe(409);
  expect(
    (
      await otherPage.request.patch("/api/discussions", { data: otherReply })
    ).status(),
  ).toBe(404);
  expect(
    await db.bookDiscussion.count({
      where: { parentId: root.id, body: { not: "" } },
    }),
  ).toBe(0);
  const another = post(work.id);
  await page.request.patch("/api/discussions", { data: another });
  await otherPage.request.patch("/api/discussions", {
    data: post(work.id, another.id),
  });
  await db.user.delete({ where: { id: user.id } });
  expect(
    await db.bookDiscussion.count({
      where: { OR: [{ id: another.id }, { parentId: another.id }] },
    }),
  ).toBe(0);
  expect(await db.userBook.count({ where: { id: otherBook.id } })).toBe(1);
  expect(await db.work.count({ where: { id: work.id } })).toBe(1);
  await ctx.close();
});

test("genre and topic spaces filter originals and retain book journal associations", async ({
  page,
}) => {
  const owner = await login(page, "spaces");
  const work = await add(owner.id, `BoardBook ${stamp} communities`);
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  await page.goto("/community/spaces");
  await page
    .getByRole("link", { name: "Reading in translation", exact: true })
    .click();
  await page.getByRole("button", { name: "Start a discussion" }).click();
  await expect(page.getByLabel("Community", { exact: true })).toBeDisabled();
  await page.getByLabel("Discussion book").selectOption(work.id);
  await page.getByLabel("Discussion title").fill("Comparing translations");
  await page.getByLabel("Discussion display name").fill("Translation reader");
  await page
    .getByLabel("Your post", { exact: true })
    .fill("A thought about the translation");
  await page.getByRole("button", { name: "Publish post", exact: true }).click();
  await expect(page).toHaveURL(/community\/discussions\/[a-f0-9-]+$/);
  const id = page.url().split("/").pop()!;
  await expect(
    page.getByRole("heading", { name: "Comparing translations" }),
  ).toBeVisible();
  const root = await db.bookDiscussion.findUniqueOrThrow({ where: { id } });
  expect(root.communityId).toBe("translation");
  const general = post(work.id);
  expect(
    (await page.request.patch("/api/discussions", { data: general })).ok(),
  ).toBe(true);
  const listing = await (
    await page.request.get(
      `/api/discussions?community=translation&work=${work.id}`,
    )
  ).json();
  expect(listing.threads.map((t: { id: string }) => t.id)).toEqual([id]);
  expect(listing.threads[0]).not.toHaveProperty("body");
  expect(listing.threads[0]).not.toHaveProperty("userId");
  expect(
    (
      await (
        await page.request.get(
          `/api/discussions?community=crime&work=${work.id}`,
        )
      ).json()
    ).threads,
  ).toEqual([]);
  expect(
    (await page.request.get("/api/discussions?community=unknown")).status(),
  ).toBe(400);
  const wrong = { ...post(work.id, id), communityId: "crime" };
  expect(
    (await page.request.patch("/api/discussions", { data: wrong })).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Write a reply" }).click();
  await page.getByLabel("Discussion display name").fill("Translation reader");
  await page
    .getByLabel("Your post", { exact: true })
    .fill("A reply in the same community");
  await page.getByRole("button", { name: "Publish post", exact: true }).click();
  await expect(
    page.getByText("A reply in the same community", { exact: true }),
  ).toBeVisible();
  const journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(
    journal.discussionPosts.filter(
      (p: { communityId: string | null }) => p.communityId === "translation",
    ),
  ).toHaveLength(2);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(
    exported.discussionPosts.filter(
      (p: { communityId: string | null }) => p.communityId === "translation",
    ),
  ).toHaveLength(2);
  const move = {
    ...post(work.id),
    id,
    title: root.title,
    body: root.body,
    alias: root.alias,
    communityId: "crime",
  };
  expect(
    (await page.request.patch("/api/discussions", { data: move })).status(),
  ).toBe(409);
  expect(
    (await db.userBook.findUniqueOrThrow({ where: { id: book.id } }))
      .privateNotes,
  ).toBe("PRIVATE_LIBRARY_NOTES");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/community/spaces");
  await expect(
    page.getByRole("heading", { name: "Genre and topic communities" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/communities-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("author communities group catalogue books and original discussions without sharing private records", async ({
  page,
}) => {
  test.setTimeout(120000);
  const owner = await login(page, "authors");
  const author = `Author ${stamp} & Co`;
  const first = await add(owner.id, `BoardBook ${stamp} author 00`);
  const second = await add(owner.id, `BoardBook ${stamp} author 01`);
  const other = await add(owner.id, `BoardBook ${stamp} outsider`);
  await db.work.updateMany({
    where: { id: { in: [first.id, second.id] } },
    data: { authorName: author },
  });
  await db.work.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      title: `BoardBook ${stamp} author ${String(i + 2).padStart(2, "0")}`,
      authorName: author,
      genres: [],
      themes: [],
      embedding: [],
    })),
  });
  const roots = Array.from({ length: 21 }, (_, i) => ({
    ...post(i % 2 ? first.id : second.id),
    title: `Author thread ${i}`,
  }));
  await db.bookDiscussion.createMany({
    data: roots.map((root) => ({
      id: root.id,
      workId: root.workId,
      userId: owner.id,
      title: root.title,
      body: root.body,
      alias: root.alias,
    })),
  });
  expect(
    (
      await page.request.patch("/api/discussions", {
        data: { ...post(other.id), title: "Unrelated thread" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/community/authors");
  await page.getByLabel("Find an author").fill(`Author ${stamp}`);
  await page.getByRole("button", { name: "Search authors" }).click();
  await page.getByRole("link", { name: author, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Books by ${author}`, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Books by this author" })
      .getByRole("article"),
  ).toHaveCount(20);
  await page
    .getByRole("navigation", { name: "Author book pages" })
    .getByRole("link", { name: "Next page" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Books by this author" })
      .getByRole("article"),
  ).toHaveCount(2);
  const feedUrl = `/api/discussions?author=${encodeURIComponent(author)}`;
  const feed = await (await page.request.get(feedUrl)).json();
  const next = await (await page.request.get(`${feedUrl}&page=1`)).json();
  expect(feed.threads).toHaveLength(20);
  expect(next.threads).toHaveLength(1);
  expect(
    new Set([...feed.threads, ...next.threads].map((p: { id: string }) => p.id))
      .size,
  ).toBe(21);
  expect(JSON.stringify(feed)).not.toContain("PRIVATE_LIBRARY_NOTES");
  expect(JSON.stringify(feed)).not.toContain("Unrelated thread");
  expect(feed.threads[0]).not.toHaveProperty("body");
  expect(
    (await (await page.request.get(`${feedUrl}&work=${other.id}`)).json())
      .threads,
  ).toHaveLength(0);
  expect((await page.request.get("/api/discussions?author=%20")).status()).toBe(
    400,
  );
  await page.goto(`/community/authors?author=${encodeURIComponent(author)}`);
  await page
    .getByRole("link", { name: `Discuss ${first.title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Start a discussion" }).click();
  await page
    .getByLabel("Discussion title")
    .fill("Author community contribution");
  await page.getByLabel("Discussion display name").fill("A reader");
  await page
    .getByLabel("Your post", { exact: true })
    .fill("A shared author observation");
  await page.getByRole("button", { name: "Publish post", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Author community contribution" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `More discussions about books by ${author}`,
    }),
  ).toBeVisible();
  const book = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id, edition: { workId: first.id } },
  });
  const journal = await (
    await page.request.get(`/api/library/${book.id}/journal`)
  ).json();
  expect(
    journal.discussionPosts.some(
      (p: { title: string }) => p.title === "Author community contribution",
    ),
  ).toBe(true);
  // Catalogue corrections update discovery, while work-based journal ownership stays stable.
  await db.work.update({
    where: { id: first.id },
    data: { authorName: `Corrected ${stamp}` },
  });
  const corrected = await (await page.request.get(feedUrl)).json();
  expect(
    corrected.threads.every((p: { workId: string }) => p.workId === second.id),
  ).toBe(true);
  expect(
    (await (await page.request.get(`/api/library/${book.id}/journal`)).json())
      .discussionPosts,
  ).toHaveLength(journal.discussionPosts.length);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/community/authors?author=${encodeURIComponent(author)}`);
  await expect(
    page.getByRole("heading", { name: `Books by ${author}`, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/author-community-mobile.png" });
});
