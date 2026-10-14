import Link from "next/link";
import { discussionCommunities } from "@/lib/discussion-communities";
export default function Page() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <Link className="underline" href="/community">
        Community
      </Link>
      <Link className="underline" href="/community/authors">
        Author communities
      </Link>
      <h1 className="font-display text-3xl">Genre and topic communities</h1>
      <p>
        Find readers exploring similar books and ideas. Choose a space to browse
        or start a book-linked discussion. Your own contributions also appear in
        the private journal for that book.
      </p>
      <p>
        Posts are visible to signed-in readers. Joining a discussion never
        shares your private notes or changes your bookshelf.
      </p>
      {["Genre", "Topic"].map((kind) => (
        <section
          key={kind}
          className="space-y-3"
          aria-label={`${kind} communities`}
        >
          <h2 className="text-xl">{kind === "Genre" ? "Genres" : "Topics"}</h2>
          {discussionCommunities
            .filter((c) => c.kind === kind)
            .map((c) => (
              <article key={c.id} className="border rounded-xl p-4 space-y-2">
                <h3 className="text-lg">
                  <Link
                    className="underline"
                    href={`/community/discussions?community=${c.id}`}
                  >
                    {c.name}
                  </Link>
                </h3>
                <p>{c.description}</p>
              </article>
            ))}
        </section>
      ))}
    </main>
  );
}
