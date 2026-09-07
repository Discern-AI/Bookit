import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Give your shelf a name." },
      { status: 400 },
    );
  const shelf = await prisma.customShelf.upsert({
    where: { userId_name: { userId: session.user.id, name: parsed.data.name } },
    update: {},
    create: { userId: session.user.id, name: parsed.data.name },
  });
  return NextResponse.json({ shelf });
}
