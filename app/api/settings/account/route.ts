import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("name"),
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      currentPassword: z.string().min(1).max(72),
      confirmation: z.literal("DELETE"),
    })
    .strict(),
]);
function reply(status: number, error?: string) {
  return Response.json(error ? { error } : { ok: true }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return reply(401, "Sign in first.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return reply(403, "Use account settings on this site.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply(415, "Send account details as JSON.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply(
      400,
      "Enter a name of 1-100 characters, or your current password and DELETE to confirm deletion.",
    );
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: session.user.id } });
      if (!user || user.authVersion !== session.user.authVersion)
        return { status: 401, error: "Your session expired. Sign in again." };
      if (parsed.data.action === "name") {
        await tx.user.update({
          where: { id: user.id },
          data: { name: parsed.data.name },
        });
        return { status: 200 };
      }
      if (
        !user.password ||
        !(await bcrypt.compare(parsed.data.currentPassword, user.password))
      )
        return { status: 403, error: "Current password is incorrect." };
      const claimedLists = await tx.giftItem.findMany({
        where: { claimedById: user.id },
        distinct: ["contactId"],
        select: { contactId: true },
      });
      for (const { contactId } of claimedLists.sort((a, b) =>
        a.contactId.localeCompare(b.contactId),
      )) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contactId}))`;
        await tx.giftContact.updateMany({
          where: { id: contactId },
          data: { version: { increment: 1 } },
        });
      }
      await tx.giftItem.updateMany({
        where: { claimedById: user.id },
        data: {
          claimedById: null,
          claimedAt: null,
          claimVersion: { increment: 1 },
        },
      });
      if (user.email)
        await tx.verificationToken.deleteMany({
          where: { identifier: user.email },
        });
      await tx.user.delete({ where: { id: user.id } });
      return { status: 200 };
    });
    return reply(result.status, result.error);
  } catch {
    return reply(503, "Could not complete this account change. Try again.");
  }
}
