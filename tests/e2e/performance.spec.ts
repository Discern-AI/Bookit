import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const stamp = Date.now();
const email = `performance-${stamp}@example.test`;
const password = "performance-test-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { name: "Performance reader", email, password },
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
  await db.work.deleteMany({
    where: { title: `Performance ${stamp} session history` },
  });
  await db.$disconnect();
});

test("bounded session-history load and warmed core routes stay responsive", async ({
  page,
}) => {
  const user = await login(page);
  const work = await db.work.create({
    data: {
      title: `Performance ${stamp} session history`,
      authorName: "A. Reader",
      genres: [],
      themes: [],
      embedding: [],
      editions: {
        create: {
          format: "paperback",
          userBooks: { create: { userId: user.id, shelf: "reading_now" } },
        },
      },
    },
    include: { editions: { include: { userBooks: true } } },
  });
  const book = work.editions[0].userBooks[0];
  await db.readingSession.createMany({
    data: Array.from({ length: 100 }, (_, index) => ({
      userId: user.id,
      userBookId: book.id,
      date: new Date(Date.UTC(2026, 0, 1, 12, index)),
      pageStart: index * 5,
      pageEnd: index * 5 + 5,
    })),
  });

  const started = Date.now();
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      page.request.get(`/api/library/${book.id}/sessions`),
    ),
  );
  const elapsed = Date.now() - started;
  expect(responses.every((response) => response.status() === 200)).toBe(true);
  const payloads = await Promise.all(responses.map((response) => response.json()));
  expect(
    payloads.every(
      (payload) =>
        payload.sessions.length === 25 &&
        payload.totalCount === 100 &&
        typeof payload.nextCursor === "string",
    ),
  ).toBe(true);
  expect(elapsed, "20 concurrent session-history reads").toBeLessThan(5000);

  for (const route of ["/chat", "/library", "/browse", "/community", "/settings"]) {
    await page.goto(route);
    const routeStarted = Date.now();
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    expect(Date.now() - routeStarted, `${route} warmed navigation`).toBeLessThan(
      3000,
    );
  }
});
