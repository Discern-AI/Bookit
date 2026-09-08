import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FollowPath, SharePath } from "@/components/paths/PathActions";
export const dynamic = "force-dynamic";
export default async function PathPage({
  params,
}: {
  params: { pathId: string };
}) {
  const session = await auth();
  const path = await prisma.readingPath.findFirst({
    where: {
      id: params.pathId,
      ...(session?.user
        ? { OR: [{ isPublic: true }, { userId: session.user.id }] }
        : { isPublic: true }),
    },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      isPublic: true,
      user: { select: { name: true } },
      entries: {
        orderBy: { position: "asc" },
        select: {
          workId: true,
          note: true,
          work: { select: { title: true, authorName: true } },
        },
      },
    },
  });
  if (!path) notFound();
  const owner = session?.user?.id === path.userId;
  const following =
    session?.user && path.isPublic
      ? !!(await prisma.readingPathFollow.findUnique({
          where: {
            userId_pathId: { userId: session.user.id, pathId: path.id },
          },
          select: { pathId: true },
        }))
      : false;
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <nav className="flex justify-between text-shelf-700">
        <Link href={session?.user ? "/browse/paths" : "/login"}>
          Folio reading paths
        </Link>
        {!session?.user && <Link href="/login">Sign in</Link>}
      </nav>
      <header className="space-y-4">
        <p className="text-sm text-ink-500">
          {path.isPublic ? "Public reading path" : "Private reading path"}{" "}
          &middot; {path.entries.length} books
        </p>
        <h1 className="font-display text-4xl break-words">{path.title}</h1>
        <p className="text-sm text-ink-500">
          By {path.user.name || "Folio reader"}
        </p>
        <p className="whitespace-pre-wrap break-words">{path.description}</p>
        <div className="flex flex-wrap items-start gap-3">
          {owner && (
            <Link
              href={`/browse/paths/${path.id}/edit`}
              className="rounded bg-shelf-700 text-white px-4 py-2"
            >
              Edit path
            </Link>
          )}
          {path.isPublic && <SharePath />}
          {path.isPublic && session?.user && !owner && (
            <FollowPath id={path.id} initialFollowing={following} />
          )}
          {!session?.user && (
            <Link href="/login" className="text-shelf-700 underline">
              Sign in to follow this path
            </Link>
          )}
        </div>
      </header>
      <ol className="space-y-5">
        {path.entries.map((entry, index) => (
          <li
            key={entry.workId}
            className="bg-paper-100 rounded-md p-5 space-y-3"
          >
            <h2 className="font-display text-2xl break-words">
              {index + 1}. {entry.work.title}
            </h2>
            <p className="text-sm text-ink-500">{entry.work.authorName}</p>
            {entry.note && (
              <p className="whitespace-pre-wrap break-words">{entry.note}</p>
            )}
            <Link
              href={`/book/${entry.workId}`}
              className="inline-block text-shelf-700 hover:underline"
            >
              View book and choose an edition
            </Link>
          </li>
        ))}
      </ol>
      {!path.entries.length && (
        <p className="text-ink-500">
          Your path is ready for its first book. Edit the path to add one.
        </p>
      )}
    </main>
  );
}
