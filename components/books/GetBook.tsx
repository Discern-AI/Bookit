"use client";

import { acquisitionLinks, nearbyBookshopUrl } from "@/lib/acquisition";

export function GetBook({
  title,
  author,
  isbn13,
  workId,
}: {
  title: string;
  author: string;
  isbn13?: string | null;
  workId?: string;
}) {
  const links = acquisitionLinks(title, author, isbn13);

  function findNearby() {
    if (!("geolocation" in navigator)) {
      window.open(links.mapsNearMe, "_blank", "noopener,noreferrer");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const url = nearbyBookshopUrl(position.coords.latitude, position.coords.longitude);
        window.open(url ?? links.mapsNearMe, "_blank", "noopener,noreferrer");
      },
      () => window.open(links.mapsNearMe, "_blank", "noopener,noreferrer"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  }

  return (
    <section className="space-y-2 border-t border-ink-200 pt-4">
      <h3 className="text-sm font-medium text-ink-500">Find or get this book</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-shelf-700">
        <a className="hover:underline" href={links.libraries} target="_blank" rel="noopener noreferrer">Search libraries on WorldCat</a>
        <a className="hover:underline" href={links.bookshop} target="_blank" rel="noopener noreferrer">Search Bookshop.org UK</a>
        <a className="hover:underline" href={links.niceEdits} target="_blank" rel="noopener noreferrer">Browse rare &amp; collectable editions</a>
        {workId && <a className="hover:underline" href={`/book/${workId}`}>Compare editions &amp; translations</a>}
        <button type="button" className="text-left hover:underline" onClick={findNearby}>Find nearby bookshops</button>
      </div>
      <p className="text-xs text-ink-500">
        External searches may require location permission and do not confirm stock, borrowing availability, price or edition.
      </p>
    </section>
  );
}
