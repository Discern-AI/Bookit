import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({ enabled: z.boolean(), version: z.number().int().min(0) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Provide a blog setting and version." },
      { status: 400 },
    );
  const result = await prisma.user.updateMany({
    where: { id: session.user.id, blogVersion: parsed.data.version },
    data: { blogEnabled: parsed.data.enabled, blogVersion: { increment: 1 } },
  });
  return result.count
    ? Response.json({ version: parsed.data.version + 1 })
    : Response.json(
        { error: "Blog settings changed elsewhere. Reload before saving." },
        { status: 409 },
      );
}
