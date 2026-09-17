import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accountMailReady, sendAccountMail } from "@/lib/account-mail";
const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(8)
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72);
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset"), email }).strict(),
  z
    .object({
      action: z.literal("email"),
      email,
      currentPassword: z.string().min(1).max(72),
    })
    .strict(),
]);
const redeemSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("reset"),
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password,
    })
    .strict(),
  z
    .object({
      action: z.literal("email"),
      token: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
function reply(status: number, error?: string) {
  return Response.json(error ? { error } : { ok: true }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function safeRequest(request: Request) {
  return (
    request.headers.get("content-type")?.startsWith("application/json") &&
    (!request.headers.get("origin") ||
      request.headers.get("origin") === new URL(request.url).origin)
  );
}
export async function requestAccountLink(request: Request) {
  if (!safeRequest(request)) return reply(403, "Use the form on this site.");
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return reply(400, "Check your email and password.");
  if (!accountMailReady())
    return reply(
      503,
      "Email delivery is not configured yet. Please try later.",
    );
  const data = parsed.data;
  const session = data.action === "email" ? await auth() : null;
  if (data.action === "email" && !session?.user.id)
    return reply(401, "Sign in first.");
  const user = await prisma.user.findUnique({
    where:
      data.action === "reset"
        ? { email: data.email }
        : { id: session!.user.id },
  });
  if (!user?.password)
    return data.action === "reset"
      ? reply(200)
      : reply(403, "Current password is incorrect.");
  if (
    data.action === "email" &&
    (user.authVersion !== session!.user.authVersion ||
      !(await bcrypt.compare(data.currentPassword, user.password)))
  )
    return reply(403, "Current password is incorrect or your session expired.");
  if (data.action === "email" && data.email === user.email)
    return reply(400, "Choose a different email address.");
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = `account:${user.id}:${data.action}:`;
  const identifier = `${prefix}${user.authVersion}:${Buffer.from(data.email).toString("base64url")}`;
  try {
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (
        !current ||
        current.authVersion !== user.authVersion ||
        current.email !== user.email
      )
        return false;
      const recent = await tx.verificationToken.findFirst({
        where: {
          identifier: { startsWith: prefix },
          expires: { gt: new Date(Date.now() + 29 * 60000) },
        },
      });
      if (recent) return false;
      await tx.verificationToken.deleteMany({
        where: { identifier: { startsWith: prefix } },
      });
      await tx.verificationToken.create({
        data: {
          identifier,
          token: hash,
          expires: new Date(Date.now() + 30 * 60000),
        },
      });
      return true;
    });
    if (created) {
      const url = new URL(
        "/account-link",
        process.env.NEXTAUTH_URL || "http://localhost:3000",
      );
      url.hash = new URLSearchParams({
        action: data.action,
        token: raw,
      }).toString();
      try {
        await sendAccountMail(data.email, url.toString(), data.action);
      } catch {
        await prisma.verificationToken.deleteMany({ where: { token: hash } });
        return data.action === "reset" ? reply(200) : reply(503, "Email could not be sent. Try again shortly.");
      }
    }
    return reply(200);
  } catch {
    return reply(503, "Could not request a link. Try again shortly.");
  }
}
export async function redeemAccountLink(request: Request) {
  if (!safeRequest(request)) return reply(403, "Use the form on this site.");
  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply(
      400,
      "Use a valid link and a password of 8-72 bytes when resetting it.",
    );
  const data = parsed.data;
  const hash = createHash("sha256").update(data.token).digest("hex");
  const saved = await prisma.verificationToken.findUnique({
    where: { token: hash },
  });
  const parts = saved?.identifier.split(":");
  if (
    !saved ||
    !parts ||
    parts.length !== 5 ||
    parts[0] !== "account" ||
    parts[2] !== data.action
  )
    return reply(400, "This link is invalid or expired. Request a new one.");
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${parts[1]} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: parts[1] } });
      const token = await tx.verificationToken.findUnique({
        where: { token: hash },
      });
      if (
        !user ||
        !token ||
        token.expires <= new Date() ||
        user.authVersion !== Number(parts[3])
      )
        return false;
      if (data.action === "reset")
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: await bcrypt.hash(data.password, 12),
            authVersion: { increment: 1 },
          },
        });
      else {
        const nextEmail = email.parse(
          Buffer.from(parts[4], "base64url").toString(),
        );
        await tx.user.update({
          where: { id: user.id },
          data: {
            email: nextEmail,
            emailVerified: new Date(),
            authVersion: { increment: 1 },
          },
        });
      }
      await tx.verificationToken.deleteMany({
        where: { identifier: { startsWith: `account:${user.id}:` } },
      });
      return true;
    });
    return result
      ? reply(200)
      : reply(400, "This link is invalid or expired. Request a new one.");
  } catch {
    return reply(
      409,
      "Could not complete this change. The email may already be in use; request a new link or try again.",
    );
  }
}
