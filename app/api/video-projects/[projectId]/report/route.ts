import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({ reason: z.enum(["spam", "harassment", "misleading", "copyright", "other"]), details: z.string().trim().max(2000).default("") }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a valid reason and keep details under 2,000 characters." }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.videoProject.findFirst({ where: { id: params.projectId, isPublic: true, deletedAt: null, publicModerationStatus: "active" }, include: { books: { select: { workId: true }, orderBy: { position: "asc" } } } });
    if (!project) return { status: 404, error: "Video not found." };
    if (project.userId === session.user.id) return { status: 400, error: "You cannot report your own video." };
    const existing = await tx.videoProjectReport.findUnique({ where: { projectId_reporterId_version: { projectId: project.id, reporterId: session.user.id, version: project.version } }, select: { id: true } });
    if (existing) return { status: 200, ok: true };
    await tx.videoProjectReport.create({ data: { projectId: project.id, reporterId: session.user.id, version: project.version, title: project.title, publicDescription: project.publicDescription, linkedWorkIds: project.books.map((book) => book.workId), ...parsed.data } });
    return { status: 201, ok: true };
  });
  return Response.json(result, { status: result.status });
}
