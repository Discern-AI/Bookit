import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export async function DELETE(
  _request: Request,
  props: { params: Promise<{ commentId: string }> },
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const result = await prisma.reviewComment.updateMany({
    where: { id: params.commentId, userId: session.user.id },
    data: { isHidden: true },
  });
  return result.count
    ? Response.json({ removed: true })
    : Response.json({ error: "Comment not found." }, { status: 404 });
}
