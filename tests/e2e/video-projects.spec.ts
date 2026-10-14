import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFile } from "node:fs/promises";
import "dotenv/config";
const stamp = Date.now();
const password = "video-plan-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `video-plan-${stamp}-${suffix}@example.test`;
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
    where: { email: { startsWith: `video-plan-${stamp}-` } },
  });
  await db.work.deleteMany({
    where: { title: { startsWith: `Video ${stamp}` } },
  });
  await db.$disconnect();
});

const plan = (workId: string) => ({
  title: "Private video plan",
  platform: "youtube",
  status: "scripting",
  script: "Private script",
  notes: "Private production notes",
  publishedUrl: "",
  books: [{ workId }],
});

test("video plans save drafts and posted links against original book journals", async ({
  page,
}) => {
  test.setTimeout(120000);
  const owner = await login(page, "owner");
  const first = await add(owner.id, `Video ${stamp} First`),
    second = await add(owner.id, `Video ${stamp} Second`);
  const copies = await db.userBook.findMany({
    where: { userId: owner.id },
    include: { edition: true },
  });
  const one = copies.find((b) => b.edition.workId === first.id)!,
    two = copies.find((b) => b.edition.workId === second.id)!;
  await page.goto("/creator/videos");
  await page.getByRole("link", { name: "New video plan", exact: true }).click();
  await page
    .getByLabel("Plan title", { exact: true })
    .fill("Private video plan");
  await page
    .getByLabel("Intended platform", { exact: true })
    .selectOption("youtube");
  await page
    .getByLabel("Production status", { exact: true })
    .selectOption("scripting");
  await page.getByLabel("Video script", { exact: true }).fill("Private script");
  await page
    .getByLabel("Production notes", { exact: true })
    .fill("Private production notes");
  for (const book of [first, second])
    await page
      .getByRole("button", { name: `Link ${book.title}`, exact: true })
      .click();
  await page
    .getByRole("button", { name: `Move ${second.title} up`, exact: true })
    .click();
  let captured: any;
  await page.route("**/api/video-projects", async (route) => {
    captured = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Save unavailable; draft retained." }),
    });
  });
  const editor = page.getByRole("form", { name: "Video plan editor" });
  await page
    .getByRole("button", { name: "Save video plan", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText("draft retained");
  await expect(page.getByLabel("Video script", { exact: true })).toHaveValue(
    "Private script",
  );
  await page.unroute("**/api/video-projects");
  await page
    .getByRole("button", { name: "Save video plan", exact: true })
    .click();
  await expect(page).toHaveURL(/creator\/videos\/edit\?project=/);
  const id = new URL(page.url()).searchParams.get("project")!;
  expect(id).toBe(captured.id);
  expect(
    (await page.request.patch("/api/video-projects", { data: captured })).ok(),
  ).toBe(true);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Linked video books" })
      .getByRole("listitem")
      .first(),
  ).toContainText(second.title);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download current script", exact: true })
    .click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe(
    "Private script",
  );
  const journal = async (bookId: string) =>
    (await page.request.get(`/api/library/${bookId}/journal`)).json();
  expect(
    (await journal(one.id)).videoProjects.map((p: { id: string }) => p.id),
  ).toEqual([id]);
  const exported = await (await page.request.get("/api/library/export")).json();
  expect(exported.videoProjects[0].script).toBe("Private script");
  expect(
    exported.videoProjects[0].books.map((b: { workId: string }) => b.workId),
  ).toEqual([second.id, first.id]);
  expect(
    (
      await page.request.patch("/api/video-projects", {
        data: {
          ...captured,
          version: 1,
          project: { ...captured.project, script: "Other tab" },
        },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByLabel("Video script", { exact: true })
    .fill("Conflicting draft");
  await page
    .getByRole("button", { name: "Save video plan", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText(
    "changed or was deleted",
  );
  await expect(page.getByLabel("Video script", { exact: true })).toHaveValue(
    "Conflicting draft",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Video script", { exact: true })).toHaveValue(
    "Other tab",
  );
  await page
    .getByLabel("Production status", { exact: true })
    .selectOption("published");
  await page
    .getByLabel("Posted video link", { exact: true })
    .fill("https://example.test/my-video");
  await page
    .getByRole("button", { name: "Save video plan", exact: true })
    .click();
  await expect(
    editor.getByRole("status").filter({ hasText: "saved privately" }),
  ).toBeVisible();
  await page.goto(`/library/book/${one.id}`);
  const videoSection = page.getByRole("region", { name: "Your video plans" });
  await expect(
    videoSection.getByRole("link", {
      name: "Open recorded video link",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://example.test/my-video");
  await videoSection
    .getByRole("link", { name: "Private video plan", exact: true })
    .click();
  await page
    .getByLabel("Production status", { exact: true })
    .selectOption("editing");
  await expect(
    page.getByLabel("Posted video link", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Remove ${first.title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save video plan", exact: true })
    .click();
  await expect(
    editor.getByRole("status").filter({ hasText: "saved privately" }),
  ).toBeVisible();
  expect((await journal(one.id)).videoProjects).toEqual([]);
  expect((await journal(two.id)).videoProjects[0].publishedUrl).toBe("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Edit video plan", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/video-plan-mobile.png" });
  await page
    .getByRole("button", { name: "Delete video plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep video plan", exact: true })
    .click();
  expect(
    (await db.videoProject.findUniqueOrThrow({ where: { id } })).deletedAt,
  ).toBeNull();
  await page
    .getByRole("button", { name: "Delete video plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete video plan", exact: true })
    .click();
  await expect(page).toHaveURL("/creator/videos");
  expect((await journal(two.id)).videoProjects).toEqual([]);
  expect(
    (await (await page.request.get("/api/library/export")).json())
      .videoProjects,
  ).toEqual([]);
  expect(
    (
      await page.request.patch("/api/video-projects", { data: captured })
    ).status(),
  ).toBe(409);
  const deleted = await db.videoProject.findUniqueOrThrow({
    where: { id },
    include: { books: true },
  });
  expect(deleted.script).toBe("");
  expect(deleted.notes).toBe("");
  expect(deleted.publishedUrl).toBe("");
  expect(deleted.books).toHaveLength(0);
  expect(
    (await db.userBook.findUniqueOrThrow({ where: { id: two.id } }))
      .privateNotes,
  ).toBe("PRIVATE_LIBRARY_NOTES");
});

test("video plans enforce ownership, paginate and cascade with account deletion", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const owner = await login(page, "security");
  const work = await add(owner.id, `Video ${stamp} Security`);
  const copy = await db.userBook.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const body = {
    action: "save",
    id: crypto.randomUUID(),
    version: 0,
    project: plan(work.id),
  };
  const context = await browser.newContext();
  const other = await context.newPage();
  expect(
    (await other.request.patch("/api/video-projects", { data: body })).status(),
  ).toBe(401);
  await login(other, "other");
  expect(
    (
      await other.request.patch("/api/video-projects", {
        data: { ...body, id: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch("/api/video-projects", {
        data: body,
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/video-projects", {
        data: {
          ...body,
          project: {
            ...body.project,
            status: "published",
            publishedUrl: "javascript:alert(1)",
          },
        },
      })
    ).status(),
  ).toBe(400);
  const responses = await Promise.all([
    page.request.patch("/api/video-projects", { data: body }),
    page.request.patch("/api/video-projects", { data: body }),
  ]);
  for (const response of responses) expect(response.ok()).toBe(true);
  expect(await db.videoProject.count({ where: { id: body.id } })).toBe(1);
  expect(
    (
      await other.request.patch("/api/video-projects", {
        data: { ...body, version: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.patch("/api/video-projects", {
        data: { action: "delete", id: body.id, version: 1 },
      })
    ).status(),
  ).toBe(404);
  await other.goto(`/creator/videos/edit?project=${body.id}`);
  await expect(
    other.getByText("This page could not be found.", { exact: true }),
  ).toBeVisible();
  await expect(other.getByLabel("Video script", { exact: true })).toHaveCount(
    0,
  );
  expect(
    (await (await other.request.get("/api/library/export")).json())
      .videoProjects,
  ).toEqual([]);
  await context.close();
  const seeded = Array.from({ length: 52 }, (_, i) => ({
    id: crypto.randomUUID(),
    userId: owner.id,
    title: `Plan ${i}`,
  }));
  await db.videoProject.createMany({ data: seeded });
  await db.videoProjectBook.createMany({
    data: seeded.map((p) => ({
      projectId: p.id,
      workId: work.id,
      position: 0,
    })),
  });
  const first = await (
    await page.request.get(`/api/library/${copy.id}/journal`)
  ).json();
  const second = await (
    await page.request.get(`/api/library/${copy.id}/journal?page=1`)
  ).json();
  expect(first.videoProjects).toHaveLength(50);
  expect(second.videoProjects).toHaveLength(3);
  expect(
    new Set(
      [...first.videoProjects, ...second.videoProjects].map(
        (p: { id: string }) => p.id,
      ),
    ).size,
  ).toBe(53);
  await page.goto("/creator/videos");
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(20);
  await db.userBook.delete({ where: { id: copy.id } });
  expect(
    (
      await page.request.patch("/api/video-projects", {
        data: {
          ...body,
          version: 1,
          project: { ...body.project, notes: "Retained after library removal" },
        },
      })
    ).ok(),
  ).toBe(true);
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
  expect(await db.videoProject.count({ where: { userId: owner.id } })).toBe(0);
  expect(await db.videoProjectBook.count({ where: { workId: work.id } })).toBe(
    0,
  );
  expect(await db.work.findUnique({ where: { id: work.id } })).not.toBeNull();
});

test("private video clips upload, seek, reject other readers and delete", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const user = await login(page, "clips");
  const work = await add(user.id, `Video ${stamp} Clip`);
  const project = await db.videoProject.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      title: "Clip plan",
      books: { create: { workId: work.id, position: 0 } },
    },
  });
  const url = `/api/video-projects/${project.id}/clip`;
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.goto(`/creator/videos/edit?project=${project.id}`);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10),
      recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    const result = new Promise<number[]>((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () =>
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
        );
    });
    recorder.start();
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "blue" : "red";
      ctx.fillRect(0, 0, 64, 64);
      await new Promise((r) => setTimeout(r, 100));
    }
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    return result;
  });
  expect(
    (
      await page.request.post(url, {
        headers: { Origin: origin },
        data: Buffer.from("fake video"),
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(url, {
        headers: { Origin: origin },
        data: Buffer.alloc(25 * 1024 * 1024 + 1),
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await page.request.post(url, {
        headers: { Origin: "https://other.test" },
        data: Buffer.from(bytes),
      })
    ).status(),
  ).toBe(403);
  const section = page.getByRole("region", { name: "Private video clip" });
  await section.getByLabel("Choose private video").setInputFiles({
    name: "clip.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(bytes),
  });
  await section.getByRole("button", { name: "Upload private clip" }).click();
  await expect(section.locator("video")).toBeVisible();
  await expect
    .poll(() =>
      section.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await section.locator("video").evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
  });
  await expect
    .poll(() =>
      section.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0);
  const downloaded = page.waitForEvent("download");
  await section.getByRole("link", { name: "Download video" }).click();
  const download = await downloaded;
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(bytes));
  const clip = (await (await page.request.get(url + "?metadata")).json()).clip;
  const playback = url + `?id=${clip.id}`;
  const range = await page.request.get(playback, {
    headers: { Range: "bytes=2-9" },
  });
  expect(range.status()).toBe(206);
  expect(await range.body()).toEqual(Buffer.from(bytes.slice(2, 10)));
  expect(
    (
      await page.request.get(playback, {
        headers: { Range: "bytes=999999999-" },
      })
    ).status(),
  ).toBe(416);
  expect(
    (
      await page.request.post(url, {
        headers: { Origin: origin },
        data: Buffer.from(bytes),
      })
    ).status(),
  ).toBe(409);
  const other = await browser.newContext(),
    otherPage = await other.newPage();
  expect((await otherPage.request.get(playback)).status()).toBe(404);
  await login(otherPage, "clipother");
  expect((await otherPage.request.get(playback)).status()).toBe(404);
  expect(
    (
      await otherPage.request.delete(playback, { headers: { Origin: origin } })
    ).status(),
  ).toBe(404);
  await other.close();
  await section
    .getByRole("button", { name: "Remove clip", exact: true })
    .click();
  await section.getByRole("button", { name: "Keep clip" }).click();
  expect((await page.request.get(playback)).status()).toBe(200);
  await section
    .getByRole("button", { name: "Remove clip", exact: true })
    .click();
  await section.getByRole("button", { name: "Confirm remove clip" }).click();
  await expect(section.getByLabel("Choose private video")).toBeVisible();
  expect((await page.request.get(playback)).status()).toBe(404);
  expect(
    (
      await page.request.post(url, {
        headers: { Origin: origin },
        data: Buffer.from(bytes),
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.patch("/api/video-projects", {
        headers: { Origin: origin },
        data: { action: "delete", id: project.id, version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(await db.videoClip.count({ where: { projectId: project.id } })).toBe(
    0,
  );
  expect(
    (
      await page.request.post(url, {
        headers: { Origin: origin },
        data: Buffer.from(bytes),
      })
    ).status(),
  ).toBe(404);
  const cascade = await db.videoProject.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      title: "Cascade clip",
      clip: { create: { mimeType: "video/webm", data: Buffer.from(bytes) } },
    },
  });
  await db.user.delete({ where: { id: user.id } });
  expect(await db.videoClip.count({ where: { projectId: cascade.id } })).toBe(
    0,
  );
});
