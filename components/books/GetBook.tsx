export function GetBook({
  title,
  author,
  isbn13,
}: {
  title: string;
  author: string;
  isbn13?: string | null;
}) {
  const query = encodeURIComponent(isbn13 || `${title} ${author}`);
  return (
    <section className="space-y-2 border-t border-ink-200 pt-4">
      <h3 className="text-sm font-medium text-ink-500">Get this book</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-shelf-700">
        <a
          className="hover:underline"
          href={`https://search.worldcat.org/search?q=${query}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search libraries on WorldCat
        </a>
        <a
          className="hover:underline"
          href={`https://uk.bookshop.org/search?keywords=${query}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search Bookshop.org UK
        </a>
        <a
          className="hover:underline"
          href={`https://openlibrary.org/search?q=${query}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search Open Library
        </a>
      </div>
      <p className="text-xs text-ink-500">
        Opens an external search. Check the edition, price and availability
        there.
      </p>
    </section>
  );
}
