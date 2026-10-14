import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookDiscussions } from "@/components/community/BookDiscussions";
export default async function Page({
  searchParams,
}: {
  searchParams: { author?: string; q?: string; page?: string };
}) {
  const author = searchParams.author;
  const query = (searchParams.q || "").trim();
  const page = Number(searchParams.page || 0);
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 100000 ||
    query.length > 100 ||
    (author !== undefined && (!author.trim() || author.length > 500))
  )
    notFound();
  const books = author
    ? await prisma.work.findMany({
        where: { authorName: author },
        select: { id: true, title: true },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: page * 20,
        take: 21,
      })
    : [];
  if (
    author &&
    !(await prisma.work.findFirst({
      where: { authorName: author },
      select: { id: true },
    }))
  )
    notFound();
  const authors = author
    ? []
    : await prisma.work.groupBy({
        by: ["authorName"],
        where: {
          authorName: {
            not: "",
            ...(query ? { contains: query, mode: "insensitive" as const } : {}),
          },
        },
        orderBy: { authorName: "asc" },
        skip: page * 20,
        take: 21,
      });
  const base = author
    ? `/community/authors?author=${encodeURIComponent(author)}`
    : `/community/authors?q=${encodeURIComponent(query)}`;
  const more = (author ? books : authors).length > 20;
  return (
    <>
      <main className="max-w-2xl mx-auto p-6 space-y-5">
        <nav className="flex flex-wrap gap-3">
          <Link className="underline" href="/community">
            Community
          </Link>
          <Link className="underline" href="/community/authors">
            All author communities
          </Link>
        </nav>
        <h1 className="font-display text-3xl break-words">
          {author ? `Books by ${author}` : "Author communities"}
        </h1>
        <p>
          Explore books and shared discussions grouped by the author name in our
          catalogue. Names are not verified identities: writers with the same
          name may appear together, and spelling variants may appear separately.
        </p>
        {author ? (
          <>
            <p>
              Choose a book to start or join a discussion. Your own
              contributions appear in its private bookshelf journal; private
              notes stay private.
            </p>
            <section aria-label="Books by this author" className="space-y-3">
              {books.slice(0, 20).map((book) => (
                <article
                  key={book.id}
                  className="border rounded-xl p-4 space-y-2"
                >
                  <h2 className="text-xl break-words">
                    <Link className="underline" href={`/book/${book.id}`}>
                      {book.title}
                    </Link>
                  </h2>
                  <Link
                    className="underline"
                    href={`/community/discussions?work=${book.id}`}
                  >
                    Discuss {book.title}
                  </Link>
                </article>
              ))}
            </section>
            {!books.length && <p>No books on this page.</p>}
          </>
        ) : (
          <>
            <form className="flex flex-wrap gap-3" action="/community/authors">
              <label>
                Find an author
                <input
                  name="q"
                  defaultValue={query}
                  maxLength={100}
                  className="block border rounded p-2"
                />
              </label>
              <button className="border rounded px-3 py-2">
                Search authors
              </button>
            </form>
            <section aria-label="Author results" className="space-y-3">
              {authors.slice(0, 20).map(({ authorName }) => (
                <p key={authorName} className="break-words">
                  <Link
                    className="underline"
                    href={`/community/authors?author=${encodeURIComponent(authorName)}`}
                  >
                    {authorName}
                  </Link>
                </p>
              ))}
            </section>
            {!authors.length && (
              <p>
                No authors found. Try another name or add a book to the
                catalogue through Browse.
              </p>
            )}
          </>
        )}
        <nav
          aria-label={author ? "Author book pages" : "Author result pages"}
          className="flex gap-4"
        >
          {page > 0 && (
            <Link className="underline" href={`${base}&page=${page - 1}`}>
              Previous page
            </Link>
          )}
          <span>Page {page + 1}</span>
          {more && (
            <Link className="underline" href={`${base}&page=${page + 1}`}>
              Next page
            </Link>
          )}
        </nav>
      </main>
      {author && <BookDiscussions key={author} authorName={author} />}
    </>
  );
}
