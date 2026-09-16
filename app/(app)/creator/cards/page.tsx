import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShareCardStudio } from "@/components/articles/ShareCardStudio";
export default async function Page() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    select: { profilePublic: true, publicName: true, username: true },
  });
  const publicByline =
    user.profilePublic && user.username ? `@${user.username}` : "";
  return <ShareCardStudio publicByline={publicByline} />;
}
