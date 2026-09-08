import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pathCardSelect } from "@/lib/path-data";
import { PathCard } from "@/components/paths/PathCard";
export default async function PathsPage({
  searchParams,
}: {
  searchParams: { view?: string; page?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;
  const view = ["mine", "following"].includes(searchParams.view ?? "")
    ? searchParams.view!
    : "public";
  const page = Math.max(1, Math.min(10000, Number(searchParams.page) || 1));
  const paths = await prisma.readingPath.findMany({
    where:
      view === "mine"
        ? { userId: session.user.id }
        : {
            isPublic: true,
            ...(view === "following"
              ? { followers: { some: { userId: session.user.id } } }
              : {}),
          },
    select: pathCardSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: (Math.floor(page) - 1) * 24,
    take: 25,
  });
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <Link href="/browse" className="text-sm text-shelf-700">
        Back to Browse
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl">Reading paths</h1>
        <Link
          href="/browse/paths/new"
          className="bg-shelf-700 text-white rounded px-4 py-2"
        >
          Create a path
        </Link>
      </header>
      <p className="text-ink-500">
        Explore a subject or author through a sequence of books.
      </p>
      <nav aria-label="Path collections" className="flex gap-4">
        {[
          ["public", "Discover"],
          ["mine", "Your paths"],
          ["following", "Following"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/browse/paths?view=${key}`}
            aria-current={view === key ? "page" : undefined}
            className={
              view === key
                ? "text-shelf-700 font-medium underline"
                : "text-ink-500"
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {paths.slice(0, 24).map((path) => (
          <PathCard key={path.id} path={path} />
        ))}
      </div>
      {!paths.length && (
        <p>
          {view === "mine"
            ? "Create your first reading path. It starts private."
            : view === "following"
              ? "Follow a public path to find it here."
              : "No public paths yet. Create one to share a reading journey."}
        </p>
      )}
      <nav
        aria-label="Path pages"
        className="flex justify-between text-shelf-700"
      >
        {page > 1 && (
          <Link
            href={`/browse/paths?view=${view}&page=${Math.floor(page) - 1}`}
          >
            Previous page
          </Link>
        )}
        {paths.length > 24 && (
          <Link
            href={`/browse/paths?view=${view}&page=${Math.floor(page) + 1}`}
          >
            Next page
          </Link>
        )}
      </nav>
    </div>
  );
}
