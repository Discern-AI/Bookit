import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PathEditor } from "@/components/paths/PathEditor";
export default async function EditPathPage({
  params,
}: {
  params: { pathId: string };
}) {
  const session = await auth();
  if (!session?.user) return null;
  const path = await prisma.readingPath.findFirst({
    where: { id: params.pathId, userId: session.user.id },
    select: {
      id: true,
      title: true,
      description: true,
      isPublic: true,
      version: true,
      entries: {
        orderBy: { position: "asc" },
        select: {
          workId: true,
          note: true,
          work: { select: { id: true, title: true, authorName: true } },
        },
      },
    },
  });
  if (!path) notFound();
  return <PathEditor initial={path} />;
}
