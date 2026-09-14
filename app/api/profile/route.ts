import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/community";
import { Prisma } from "@prisma/client";
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = profileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Use a username of 3-30 lowercase letters, numbers or underscores, starting with a letter, and a display name.",
      },
      { status: 400 },
    );
  const { version, ...data } = parsed.data;
  try {
    const result = await prisma.user.updateMany({
      where: { id: session.user.id, profileVersion: version },
      data: { ...data, profileVersion: { increment: 1 } },
    });
    if (!result.count)
      return Response.json(
        { error: "Your profile changed elsewhere. Reload before saving." },
        { status: 409 },
      );
    return Response.json({ version: version + 1 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return Response.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    throw error;
  }
}
