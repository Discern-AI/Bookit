import { test, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { readdir, readFile, unlink } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
const mailFiles = new Set<string>();
const identifiers: string[] = [];
const stamp = Date.now();
const password = "account-settings-password";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function login(page: Page, suffix: string) {
  const email = `account-settings-${stamp}-${suffix}@example.test`;
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
test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: `account-settings-${stamp}-` } },
  });
  await db.verificationToken.deleteMany({
    where: { identifier: { in: identifiers } },
  });
  for (const file of mailFiles) await unlink(file).catch(() => undefined);
  await db.$disconnect();
});

async function delivered(email: string) {
  const directory = path.join(process.cwd(), ".local", "mail");
  const found: string[] = [];
  for (const name of await readdir(directory).catch(() => [] as string[])) {
    const file = path.join(directory, name);
    const value = JSON.parse(await readFile(file, "utf8"));
    if (value.to === email) {
      mailFiles.add(file);
      found.push(value.text.match(/https?:\/\/[^\s]+/)[0]);
    }
  }
  return found;
}
function tokenFrom(link: string) {
  return new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
test("reset and verified email links expire, work once and revoke old sessions", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.FOLIO_MAIL_MODE !== "local",
    "Requires the explicit local test outbox.",
  );
  const user = await login(page, "links");
  const old = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  const anonymous = await browser.newContext();
  const requestReset = (email: string) =>
    anonymous.request.post("/api/account-links/request", {
      data: { action: "reset", email },
    });
  expect((await requestReset(`absent-${stamp}@example.test`)).status()).toBe(
    200,
  );
  expect(await delivered(`absent-${stamp}@example.test`)).toHaveLength(0);
  await page.goto("/forgot-password");
  await page
    .getByRole("textbox", { name: "Account email", exact: true })
    .fill(user.email!);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("If an account matches");
  const link = (await delivered(user.email!))[0];
  expect(link).toBeTruthy();
  const token = tokenFrom(link);
  const saved = await db.verificationToken.findUniqueOrThrow({
    where: { token: hash(token) },
  });
  identifiers.push(saved.identifier);
  expect(saved.token).not.toBe(token);
  expect((await requestReset(user.email!)).status()).toBe(200);
  expect(await delivered(user.email!)).toHaveLength(1);
  expect(
    (
      await anonymous.request.post("/api/account-links/redeem", {
        data: { action: "email", token },
      })
    ).status(),
  ).toBe(400);
  await db.verificationToken.update({
    where: { token: hash(token) },
    data: { expires: new Date(0) },
  });
  expect(
    (
      await anonymous.request.post("/api/account-links/redeem", {
        data: { action: "reset", token, password: "new-link-password" },
      })
    ).status(),
  ).toBe(400);
  await db.verificationToken.update({
    where: { token: hash(token) },
    data: { expires: new Date(Date.now() + 60000) },
  });
  await page.goto(link);
  await expect(page).toHaveURL(/\/account-link$/);
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-link-password");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("new-link-password");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password reset");
  expect(await (await old.request.get("/api/auth/session")).json()).toBeNull();
  expect(
    (
      await anonymous.request.post("/api/account-links/redeem", {
        data: { action: "reset", token, password: "replay-password" },
      })
    ).status(),
  ).toBe(400);
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email: user.email!, password: "new-link-password" },
  });
  expect(
    (await (await page.request.get("/api/auth/session")).json()).user.id,
  ).toBe(user.id);
  expect(
    (
      await anonymous.request.post("/api/account-links/request", {
        data: {
          action: "email",
          email: "new@example.test",
          currentPassword: "new-link-password",
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post("/api/account-links/request", {
        data: {
          action: "email",
          email: "new@example.test",
          currentPassword: "wrong",
        },
      })
    ).status(),
  ).toBe(403);
  const occupied = `account-settings-${stamp}-occupied@example.test`;
  await db.user.create({ data: { email: occupied, name: "Other reader" } });
  expect(
    (
      await page.request.post("/api/account-links/request", {
        data: {
          action: "email",
          email: occupied,
          currentPassword: "new-link-password",
        },
      })
    ).status(),
  ).toBe(200);
  const collisionToken = tokenFrom((await delivered(occupied))[0]);
  identifiers.push(
    (
      await db.verificationToken.findUniqueOrThrow({
        where: { token: hash(collisionToken) },
      })
    ).identifier,
  );
  expect(
    (
      await anonymous.request.post("/api/account-links/redeem", {
        data: { action: "email", token: collisionToken },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
  ).toBe(user.email);
  await db.verificationToken.update({
    where: { token: hash(collisionToken) },
    data: { expires: new Date() },
  });
  const nextEmail = `account-settings-${stamp}-changed@example.test`;
  await page.goto("/settings");
  await page
    .getByRole("textbox", { name: "New login email", exact: true })
    .fill(nextEmail);
  await page
    .getByLabel("Current password for email change", { exact: true })
    .fill("new-link-password");
  await page
    .getByRole("button", { name: "Send email confirmation", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Check your new email" }),
  ).toBeVisible();
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
  ).toBe(user.email);
  const emailLink = (await delivered(nextEmail))[0];
  const emailToken = tokenFrom(emailLink);
  identifiers.push(
    (
      await db.verificationToken.findUniqueOrThrow({
        where: { token: hash(emailToken) },
      })
    ).identifier,
  );
  await page.goto(emailLink);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/email-confirmation-mobile.png" });
  await page
    .getByRole("button", { name: "Confirm new email", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Email changed");
  const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.email).toBe(nextEmail);
  expect(updated.emailVerified).not.toBeNull();
  expect(updated.authVersion).toBe(user.authVersion + 2);
  expect(
    (
      await anonymous.request.post("/api/account-links/redeem", {
        data: { action: "email", token: emailToken },
      })
    ).status(),
  ).toBe(400);
  await old.close();
  await anonymous.close();
});
