import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  if (!session?.user.id) return null;
  const page = Number(searchParams.page || 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) notFound();
  const projects = await prisma.cardProject.findMany({
    where: { userId: session!.user.id, deletedAt: null },
    select: { id: true, title: true, kind: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: page * 20,
    take: 21,
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-5">
      <h1 className="font-display text-3xl">Saved card projects</h1>
      <p>
        Private drafts you can reopen and edit. Saving a project does not
        publish it or create a social post.
      </p>
      <Link className="underline" href="/creator/cards">
        New card project
      </Link>
      {!projects.length && <p>No saved projects on this page.</p>}
      {projects.slice(0, 20).map((p) => (
        <article key={p.id} className="border rounded p-4">
          <Link
            className="underline break-words"
            href={`/creator/cards?project=${p.id}`}
          >
            {p.title}
          </Link>
          <p>{p.kind} card</p>
        </article>
      ))}
      <nav aria-label="Project pages" className="flex gap-4">
        {page > 0 && <Link href={`?page=${page - 1}`}>Previous page</Link>}
        <span>Page {page + 1}</span>
        {projects.length > 20 && (
          <Link href={`?page=${page + 1}`}>Next page</Link>
        )}
      </nav>
    </main>
  );
}
