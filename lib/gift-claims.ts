import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function changeGiftClaim(
  request: Request,
  itemId: string,
  reference: { token: string } | { contactId: string },
  release: boolean,
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json(
      { error: "Sign in to claim a gift." },
      { status: 401 },
    );
  const parsed = z
    .object({ version: z.number().int().min(0) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid claim request." },
      { status: 400 },
    );
  if ("token" in reference && !/^[a-f0-9]{64}$/.test(reference.token))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id =
    "contactId" in reference
      ? reference.contactId
      : (
          await prisma.giftContact.findUnique({
            where: { shareToken: reference.token },
            select: { id: true },
          })
        )?.id;
  if (!id)
    return NextResponse.json(
      { error: "This shared list is no longer available." },
      { status: 404 },
    );
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const contact = await db.giftContact.findUnique({
      where: { id },
      select: { id: true, userId: true, shareToken: true },
    });
    if (
      !contact ||
      ("token" in reference
        ? contact.shareToken !== reference.token
        : contact.userId !== session.user.id)
    )
      return { error: "This list is no longer available.", status: 404 };
    const item = await db.giftItem.findFirst({
      where: { id: itemId, contactId: id },
    });
    if (!item)
      return { error: "This gift idea is no longer on the list.", status: 404 };
    const own = item.claimedById === session.user.id;
    const owner = contact.userId === session.user.id;
    const response = () => ({
      claimed: !!item.claimedById,
      mine: own,
      canRelease: !!item.claimedById && (own || owner),
      version: item.claimVersion,
    });
    if (release && !item.claimedById) return response();
    if (!release && own) return response();
    if (release && !own && !owner)
      return {
        error:
          "Only the person who claimed this gift or the list owner can release it.",
        status: 403,
      };
    if (!release && item.claimedById)
      return {
        error: "Someone else has already claimed this gift.",
        status: 409,
      };
    if (!release && item.status !== "planned")
      return { error: "This gift has already been arranged.", status: 409 };
    if (item.claimVersion !== parsed.data.version)
      return {
        error: "This gift changed. Refresh the list before trying again.",
        status: 409,
      };
    const saved = await db.giftItem.update({
      where: { id: item.id },
      data: {
        claimedById: release ? null : session.user.id,
        claimedAt: release ? null : new Date(),
        claimVersion: { increment: 1 },
      },
    });
    await db.giftContact.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
    return {
      claimed: !!saved.claimedById,
      mine: saved.claimedById === session.user.id,
      canRelease: !!saved.claimedById,
      version: saved.claimVersion,
    };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
