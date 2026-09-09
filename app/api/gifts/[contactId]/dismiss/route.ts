import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOccasions, nextOccasion } from "@/lib/gifts";
export async function POST(
  request: Request,
  { params }: { params: { contactId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({ occasionId: z.string().uuid(), occurrence: z.string() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid reminder" }, { status: 400 });
  const result = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.contactId}))`;
    const contact = await db.giftContact.findFirst({
      where: { id: params.contactId, userId: session.user.id },
    });
    if (!contact) return { error: "Not found", status: 404 };
    const occasions = readOccasions(contact.occasions);
    const occasion = occasions.find((o) => o.id === parsed.data.occasionId);
    const next = occasion && nextOccasion(occasion);
    if (!next || next.occurrence !== parsed.data.occurrence || next.days > 21)
      return { error: "This reminder is no longer current.", status: 409 };
    if (occasion!.dismissedFor !== next.occurrence)
      await db.giftContact.update({
        where: { id: contact.id },
        data: {
          occasions: occasions.map((o) =>
            o.id === occasion!.id ? { ...o, dismissedFor: next.occurrence } : o,
          ),
          version: { increment: 1 },
        },
      });
    return { dismissed: true };
  });
  return NextResponse.json(result, {
    status: "status" in result ? result.status : 200,
  });
}
