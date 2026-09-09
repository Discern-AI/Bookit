import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function POST(
  request: Request,
  { params }: { params: { contactId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({
      action: z.enum(["enable", "rotate", "disable"]),
      version: z.number().int().positive(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid sharing change." },
      { status: 400 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.contactId}))`;
    const contact = await db.giftContact.findFirst({
      where: { id: params.contactId, userId: session.user.id },
    });
    if (!contact) return { error: "Not found", status: 404 };
    if (contact.version !== parsed.data.version)
      return {
        error: "This list changed. Reload it before changing sharing.",
        status: 409,
      };
    const token =
      parsed.data.action === "disable"
        ? null
        : parsed.data.action === "enable" && contact.shareToken
          ? contact.shareToken
          : randomBytes(32).toString("hex");
    if (token === contact.shareToken)
      return { shareToken: token, version: contact.version };
    const saved = await db.giftContact.update({
      where: { id: contact.id },
      data: { shareToken: token, version: { increment: 1 } },
    });
    return { shareToken: saved.shareToken, version: saved.version };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
