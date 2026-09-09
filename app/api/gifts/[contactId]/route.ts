import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mutateGift } from "@/lib/gift-mutations";
import { giftInclude, serializeGift } from "@/lib/gift-data";
export async function GET(
  _request: Request,
  { params }: { params: { contactId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contact = await prisma.giftContact.findFirst({
    where: { id: params.contactId, userId: session.user.id },
    include: giftInclude,
  });
  return contact
    ? NextResponse.json({ contact: serializeGift(contact) })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function PATCH(
  request: Request,
  { params }: { params: { contactId: string } },
) {
  return mutateGift(request, params.contactId);
}
export async function DELETE(
  request: Request,
  { params }: { params: { contactId: string } },
) {
  return mutateGift(request, params.contactId, true);
}
