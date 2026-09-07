import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseGoodreads } from "@/lib/goodreads";
import { jobSelect } from "@/lib/import-jobs";
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const job = await prisma.importJob.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: jobSelect,
  });
  return NextResponse.json({ job });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 5_500_000)
    return NextResponse.json(
      { error: "Choose a CSV smaller than 5 MB." },
      { status: 413 },
    );
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size > 5_000_000)
    return NextResponse.json(
      { error: "Choose a Goodreads CSV smaller than 5 MB." },
      { status: 400 },
    );
  let parsed;
  try {
    parsed = parseGoodreads(await file.text());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That CSV couldn't be read." },
      { status: 400 },
    );
  }
  const job = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const active = await db.importJob.findFirst({
      where: { userId: session.user.id, status: "queued" },
      select: jobSelect,
    });
    if (active) return active;
    return db.importJob.create({
      data: {
        userId: session.user.id,
        total: parsed.rows.length,
        rows: JSON.parse(JSON.stringify(parsed.rows)),
        errors: parsed.errors,
      },
      select: jobSelect,
    });
  });
  return NextResponse.json({ job });
}
