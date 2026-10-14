import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VIDEO_STATUSES } from "@/lib/video-projects";
export default async function Page({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  if (!session?.user.id) return null;
  const page = Number(searchParams.page || 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) notFound();
  const projects = await prisma.videoProject.findMany({
    where: { userId: session.user.id, deletedAt: null },
    select: { id: true, title: true, status: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    skip: page * 20,
    take: 21,
  });
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-5">
      <Link className="underline" href="/creator">
        Creator
      </Link>
      <h1 className="font-display text-3xl">Video plans</h1>
      <p>
        Private scripts and production notes linked to your books. Recording a
        posted link does not upload or publish anything through Folio.
      </p>
      <Link className="underline" href="/creator/videos/edit">
        New video plan
      </Link>
      {!projects.length && <p>No video plans on this page.</p>}
      {projects.slice(0, 20).map((p) => (
        <article key={p.id} className="border rounded p-4">
          <Link
            className="underline break-words"
            href={`/creator/videos/edit?project=${p.id}`}
          >
            {p.title}
          </Link>
          <p>{VIDEO_STATUSES[p.status as keyof typeof VIDEO_STATUSES]}</p>
        </article>
      ))}
      <nav aria-label="Video plan pages" className="flex gap-4">
        {page > 0 && <Link href={`?page=${page - 1}`}>Previous page</Link>}
        <span>Page {page + 1}</span>
        {projects.length > 20 && (
          <Link href={`?page=${page + 1}`}>Next page</Link>
        )}
      </nav>
    </main>
  );
}
