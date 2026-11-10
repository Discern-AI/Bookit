import { z } from "zod";
import { auth } from "@/auth";
import { sameOriginJson } from "@/lib/book-journal";
import { prisma } from "@/lib/prisma";
const schema = z.object({
  reason: z.enum(["spam", "misleading", "unsafe", "harassment", "other"]),
  details: z.string().trim().min(5).max(2000),
});
export async function POST(
  request: Request,
  props: { params: Promise<{ kitId: string }> },
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!sameOriginJson(request))
    return Response.json({ error: "Invalid request." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Choose a reason and provide details." },
      { status: 400 },
    );
  const kit = await prisma.readingKit.findFirst({
    where: {
      id: params.kitId,
      isPublic: true,
      publicModerationStatus: "active",
      deletedAt: null,
    },
    include: {
      entries: { select: { workId: true }, orderBy: { position: "asc" } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!kit || kit.userId === session.user.id)
    return Response.json({ error: "Kit not found." }, { status: 404 });
  await prisma.readingKitReport.upsert({
    where: {
      kitId_reporterId_kitVersion: {
        kitId: kit.id,
        reporterId: session.user.id,
        kitVersion: kit.version,
      },
    },
    update: {},
    create: {
      kitId: kit.id,
      reporterId: session.user.id,
      kitVersion: kit.version,
      title: kit.title,
      publicDescription: kit.publicDescription,
      publicContent: {
        creatorEssay: kit.creatorEssay,
        makeDo: kit.makeDo,
        sensoryProfile: kit.sensoryProfile,
        playlistUrl: kit.playlistUrl,
        suggestedOrder: kit.suggestedOrder,
        workIds: kit.entries.map((entry) => entry.workId),
        items: kit.items.map(({ kind, title, details, externalUrl }) => ({
          kind,
          title,
          details,
          externalUrl,
        })),
      },
      reason: parsed.data.reason,
      details: parsed.data.details,
    },
  });
  return Response.json({ reported: true });
}
