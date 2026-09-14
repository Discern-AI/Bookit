import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReviewList, reviewPage } from "@/components/community/ReviewList";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reader profile | Folio",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { page?: string };
}) {
  const user = await prisma.user.findFirst({
    where: { username: params.username, profilePublic: true },
    select: { id: true, username: true, publicName: true, bio: true },
  });
  if (!user) notFound();
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link href="/community">Folio</Link>
      <h1 className="font-display text-4xl break-words">{user.publicName}</h1>
      <p>@{user.username}</p>
      <p className="whitespace-pre-wrap break-words">{user.bio}</p>
      <h2 className="font-display text-2xl">Published reviews</h2>
      <ReviewList
        userId={user.id}
        page={reviewPage(searchParams.page)}
        basePath={`/profile/${user.username}`}
      />
    </main>
  );
}
