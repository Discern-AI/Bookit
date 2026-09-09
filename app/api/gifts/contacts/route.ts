import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mutateGift } from "@/lib/gift-mutations";
export async function POST(request: Request) {
  return mutateGift(request);
}
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const page = Math.max(
    1,
    Math.min(
      10000,
      Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1),
    ),
  );
  const contacts = await prisma.giftContact.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      budgetPence: true,
      occasions: true,
      _count: { select: { giftItems: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * 24,
    take: 25,
  });
  return NextResponse.json({
    contacts: contacts.slice(0, 24),
    nextPage: contacts.length > 24 ? page + 1 : null,
  });
}
