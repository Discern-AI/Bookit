import Link from "next/link";
import { prisma } from "@/lib/prisma";

export async function ProfileReadingKits({
  userId,
  username,
  page,
}: {
  userId: string;
  username: string;
  page: number;
}) {
  const kits = await prisma.readingKit.findMany({
    where: {
      userId,
      user: { profilePublic: true },
      isPublic: true,
      publicModerationStatus: "active",
      deletedAt: null,
    },
    select: { id: true, title: true, publicDescription: true },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * 20,
    take: 21,
  });
  const visible = kits.slice(0, 20);
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Published Reading Kits</h2>
      {visible.map((kit) => (
        <article className="rounded border border-ink-200 p-4" key={kit.id}>
          <h3 className="font-display text-xl">
            <Link className="underline" href={`/kit/${kit.id}`}>
              {kit.title}
            </Link>
          </h3>
          <p>{kit.publicDescription}</p>
        </article>
      ))}
      {!visible.length && <p>No published Reading Kits yet.</p>}
      <nav className="flex gap-4" aria-label="Reading Kit pages">
        {page > 1 && (
          <Link href={`/profile/${username}?tab=kits&page=${page - 1}`}>
            Previous
          </Link>
        )}
        {kits.length > 20 && (
          <Link href={`/profile/${username}?tab=kits&page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </section>
  );
}
