import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = z
    .object({
      goal: z.number().int().min(1).max(10000).nullable(),
      year: z.number().int().min(1900).max(3000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Choose a goal from 1 to 10,000 books, or leave it blank." },
      { status: 400 },
    );
  await prisma.user.update({
    where: { id: session.user.id },
    data: { yearlyGoal: input.data.goal, goalYear: input.data.year },
  });
  return NextResponse.json({ ok: true });
}
