export function acquisitionQuery(title: string, author: string, isbn13?: string | null) {
  return (isbn13?.trim() || `${title.trim()} ${author.trim()}`).trim();
}

export function acquisitionLinks(title: string, author: string, isbn13?: string | null) {
  const query = encodeURIComponent(acquisitionQuery(title, author, isbn13));
  const editionQuery = isbn13?.trim()
    ? `https://www.abebooks.com/servlet/SearchResults?isbn=${encodeURIComponent(isbn13.trim())}&sts=t`
    : `https://www.abebooks.com/servlet/SearchResults?kn=${encodeURIComponent(`${title.trim()} ${author.trim()}`)}&sts=t`;
  return {
    libraries: `https://search.worldcat.org/search?q=${query}`,
    bookshop: `https://uk.bookshop.org/search?keywords=${query}`,
    openLibrary: `https://openlibrary.org/search?q=${query}`,
    niceEdits: editionQuery,
    mapsNearMe: "https://www.google.com/maps/search/independent+bookshops+near+me",
  };
}

export function nearbyBookshopUrl(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return `https://www.google.com/maps/search/bookshops/@${latitude},${longitude},12z`;
}
