import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request) {
  if (!(await auth())?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length > 300)
    return NextResponse.json(
      { error: "Try a shorter search." },
      { status: 400 },
    );
  const works = await prisma.work.findMany({
    where: {
      editions: { some: {} },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { authorName: { contains: q, mode: "insensitive" as const } },
              { editions: { some: { isbn13: q } } },
            ],
          }
        : {}),
    },
    select: { id: true, title: true, authorName: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: 20,
  });
  return NextResponse.json({ works });
}
