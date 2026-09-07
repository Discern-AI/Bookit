import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { advanceImport, jobSelect } from "@/lib/import-jobs";
export const maxDuration = 60;
export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const job = await prisma.importJob.findFirst({
    where: { id: params.jobId, userId: session.user.id },
    select: jobSelect,
  });
  return NextResponse.json({ job }, { status: job ? 200 : 404 });
}
export async function POST(
  _request: Request,
  { params }: { params: { jobId: string } },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const job = await advanceImport(params.jobId, session.user.id);
    return NextResponse.json({ job }, { status: job ? 200 : 404 });
  } catch {
    return NextResponse.json(
      { error: "Import paused. Your saved progress is safe; try again." },
      { status: 503 },
    );
  }
}
