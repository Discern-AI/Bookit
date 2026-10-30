import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function PATCH(request: Request, { params }: { params: { reportId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({ action: z.enum(["dismiss", "hide", "restore"]), version: z.number().int().positive(), note: z.string().trim().min(5).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Provide the project version and a 5-2,000 character decision note." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const moderator = await tx.user.findUnique({ where: { id: session.user.id }, select: { isModerator: true } });
    if (!moderator?.isModerator) return { status: 403, error: "Moderator access required." };
    const report = await tx.videoProjectReport.findUnique({ where: { id: params.reportId }, include: { project: true } });
    if (!report) return { status: 404, error: "Report not found." };
    if (report.project.version !== parsed.data.version) return { status: 409, error: "The video changed. Reload the queue before deciding." };
    if (parsed.data.action === "restore") {
      if (report.status !== "hidden" || report.decisionVersion !== report.project.version) return { status: 409, error: "This restriction is no longer current." };
      await tx.videoProject.update({ where: { id: report.projectId }, data: { isPublic: true, publicModerationStatus: "active", version: { increment: 1 } } });
      await tx.videoProjectReport.update({ where: { id: report.id }, data: { status: "restored", note: parsed.data.note, resolvedAt: new Date(), resolvedById: session.user.id } });
    } else {
      if (report.status !== "pending") return { status: 409, error: "This report was already resolved." };
      if (parsed.data.action === "hide") await tx.videoProject.update({ where: { id: report.projectId }, data: { publicModerationStatus: "hidden", version: { increment: 1 } } });
      await tx.videoProjectReport.update({ where: { id: report.id }, data: { status: parsed.data.action === "hide" ? "hidden" : "dismissed", decisionVersion: parsed.data.action === "hide" ? report.project.version + 1 : null, note: parsed.data.note, resolvedAt: new Date(), resolvedById: session.user.id } });
    }
    return { status: 200 };
  });
  return Response.json(result, { status: result.status });
}
