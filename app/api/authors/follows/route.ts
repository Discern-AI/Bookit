import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName, validAuthorName } from "@/lib/author";

function authorInput(value: unknown) {
  if (typeof value !== "string" || !validAuthorName(value)) return null;
  return normalizeAuthorName(value);
}

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const follows = await prisma.followedAuthor.findMany({
    where: { userId: session.user.id },
    orderBy: [{ createdAt: "desc" }, { authorKey: "asc" }],
    take: 20,
  });
  return NextResponse.json({ authors: follows.map((f) => f.displayName) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ author: z.string() }).safeParse(await request.json().catch(() => null));
  const input = parsed.success ? authorInput(parsed.data.author) : null;
  if (!input)
    return NextResponse.json({ error: "Enter a valid author name." }, { status: 400 });
  await prisma.followedAuthor.upsert({
    where: { userId_authorKey: { userId: session.user.id, authorKey: input.authorKey } },
    create: { userId: session.user.id, ...input },
    update: { displayName: input.displayName },
  });
  return NextResponse.json({ followed: true, author: input.displayName });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = authorInput(new URL(request.url).searchParams.get("author") ?? "");
  if (!input)
    return NextResponse.json({ error: "Enter a valid author name." }, { status: 400 });
  await prisma.followedAuthor.deleteMany({
    where: { userId: session.user.id, authorKey: input.authorKey },
  });
  return NextResponse.json({ followed: false, author: input.displayName });
}
