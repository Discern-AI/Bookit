import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
const schema = z.object({
  action: z.enum(["password", "signout"]),
  currentPassword: z.string().min(1).max(72),
  newPassword: z
    .string()
    .min(8)
    .max(72)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72)
    .optional(),
});
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (
    !parsed.success ||
    (parsed.data.action === "password" && !parsed.data.newPassword)
  )
    return Response.json(
      {
        error:
          "Provide your current password and a new password of 8-72 bytes when changing it.",
      },
      { status: 400 },
    );
  const data = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.user.id} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    if (user.authVersion !== session.user.authVersion)
      return { status: 401, error: "Your session expired. Sign in again." };
    if (
      !user.password ||
      !(await bcrypt.compare(data.currentPassword, user.password))
    )
      return { status: 403, error: "Current password is incorrect." };
    if (data.action === "password" && data.newPassword === data.currentPassword)
      return { status: 400, error: "Choose a different new password." };
    await tx.user.update({
      where: { id: user.id },
      data: {
        authVersion: { increment: 1 },
        ...(data.action === "password"
          ? { password: await bcrypt.hash(data.newPassword!, 12) }
          : {}),
      },
    });
    return { status: 200 };
  });
  return Response.json(result, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
