import { notFound } from "next/navigation";
import { z } from "zod";
import { cardProjectInclude, serializeCardProject } from "@/lib/card-projects";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShareCardStudio } from "@/components/articles/ShareCardStudio";
export default async function Page({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    select: { profilePublic: true, publicName: true, username: true },
  });
  const publicByline =
    user.profilePublic && user.username ? `@${user.username}` : "";
  if (
    searchParams.project &&
    !z.string().uuid().safeParse(searchParams.project).success
  )
    notFound();
  const project = searchParams.project
    ? await prisma.cardProject.findFirst({
        where: {
          id: searchParams.project,
          userId: session!.user.id,
          deletedAt: null,
        },
        include: cardProjectInclude,
      })
    : null;
  if (searchParams.project && !project) notFound();
  return (
    <ShareCardStudio
      key={project?.id || "new"}
      publicByline={publicByline}
      initialProject={project ? serializeCardProject(project) : undefined}
    />
  );
}
