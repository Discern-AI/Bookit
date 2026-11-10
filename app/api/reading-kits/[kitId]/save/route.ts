import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { prisma } from "@/lib/prisma";

async function changeSave(request: Request, kitId: string, enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!sameOriginJson(request))
    return Response.json({ error: "Invalid request." }, { status: 403 });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reading-kit:" + kitId}))`;
    if (!enabled) {
      await tx.readingKitSave.deleteMany({
        where: { kitId, userId: session.user.id },
      });
      return { saved: false, status: 200 };
    }
    const kit = await tx.readingKit.findFirst({
      where: {
        id: kitId,
        isPublic: true,
        publicModerationStatus: "active",
        deletedAt: null,
      },
      select: { userId: true },
    });
    if (!kit) return { error: "Kit not found.", status: 404 };
    if (kit.userId === session.user.id)
      return { error: "You cannot save your own kit.", status: 400 };
    await tx.readingKitSave.upsert({
      where: { kitId_userId: { kitId, userId: session.user.id } },
      create: { kitId, userId: session.user.id },
      update: {},
    });
    return { saved: true, status: 200 };
  });
  return Response.json(result, { status: result.status });
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ kitId: string }> },
) {
  const params = await props.params;
  return changeSave(request, params.kitId, true);
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ kitId: string }> },
) {
  const params = await props.params;
  return changeSave(request, params.kitId, false);
}
