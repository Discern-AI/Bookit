import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  videoProjectInclude,
  serializeVideoProject,
} from "@/lib/video-projects";
import { VideoProjectEditor } from "@/components/articles/VideoProjectEditor";
export default async function Page({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const session = await auth();
  if (!session?.user.id) return null;
  if (
    searchParams.project &&
    !z.string().uuid().safeParse(searchParams.project).success
  )
    notFound();
  const project = searchParams.project
    ? await prisma.videoProject.findFirst({
        where: {
          id: searchParams.project,
          userId: session.user.id,
          deletedAt: null,
        },
        include: videoProjectInclude,
      })
    : null;
  if (searchParams.project && !project) notFound();
  return (
    <VideoProjectEditor
      key={project?.id || "new"}
      initial={project ? serializeVideoProject(project) : undefined}
    />
  );
}
