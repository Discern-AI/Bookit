import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PublishingForm } from "@/components/community/PublishingForm";
export default async function Page() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-3xl">Public profile</h1>
      <PublishingForm
        initial={{
          username: user.username ?? "",
          publicName: user.publicName,
          bio: user.bio,
          profilePublic: user.profilePublic,
          version: user.profileVersion,
        }}
      />
      {user.profilePublic && (
        <Link className="underline" href={`/profile/${user.username}`}>
          View public profile
        </Link>
      )}
    </main>
  );
}
