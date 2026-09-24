"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { BookJournal } from "@/components/library/BookJournal";
import type { BookshelfData, ShelfVolume } from "@/lib/bookshelf";
const colors = [
  "#365650",
  "#725447",
  "#414f67",
  "#75494a",
  "#6b603d",
  "#51553c",
  "#674c65",
];
function hash(value: string) {
  return [...value].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
}
export function Bookshelf({
  data,
  onRefresh,
}: {
  data: BookshelfData;
  onRefresh: () => void;
}) {
  const rail = useRef<HTMLDivElement>(null),
    now = useRef<HTMLDivElement>(null),
    positioned = useRef(false);
  const [selected, setSelected] = useState<string | null>(null),
    [manage, setManage] = useState(false),
    [search, setSearch] = useState("");
  const [journalDirty, setJournalDirty] = useState(false);
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const [showNext, setShowNext] = useState<boolean | null>(null);
  useEffect(() => {
    setPins({});
    setShowNext(null);
  }, [data]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!positioned.current && rail.current && now.current) {
      rail.current.scrollLeft = Math.max(
        0,
        now.current.offsetLeft - rail.current.clientWidth * 0.55,
      );
      positioned.current = true;
    }
  }, [data, collapsed]);
  async function update(
    path: string,
    body: { shelfPinned?: boolean; showUpNext?: boolean },
  ) {
    if (body.shelfPinned !== undefined)
      setPins((old) => ({
        ...old,
        [path.split("/").at(-1)!]: body.shelfPinned!,
      }));
    if (body.showUpNext !== undefined) setShowNext(body.showUpNext);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error((await r.json()).error);
      onRefresh();
    } catch (e) {
      setPins({});
      setShowNext(null);
      setError(e instanceof Error ? e.message : "Could not update shelf.");
    } finally {
      setBusy(false);
    }
  }
  const groups = {
    read: data.volumes.filter((v) => v.section === "read"),
    current: data.volumes.filter((v) => v.section === "current"),
    next: data.volumes.filter((v) => v.section === "next"),
  };
  const volume = (v: ShelfVolume) => {
    const seed = hash(v.workId);
    return (
      <button
        type="button"
        key={v.key}
        onClick={() => setSelected(v.bookId)}
        className="folio-spine"
        style={{
          backgroundColor: colors[seed % colors.length],
          height: `${125 + (seed % 32)}px`,
          width: `${44 + (seed % 15)}px`,
        }}
        aria-label={`${v.title}, ${v.section === "read" ? `finished ${v.date?.slice(0, 10) ?? "date unknown"}` : v.section === "current" ? "reading now" : "up next"}${v.cycle > 1 ? `, reading ${v.cycle}` : ""}`}
        title={`${v.title} / ${v.author}${v.date ? ` / ${v.date.slice(0, 10)}` : ""}`}
      >
        <span className="folio-spine-title">{v.title}</span>
        <span className="folio-spine-author">{v.author}</span>
        {v.cycle > 1 && <span className="folio-spine-cycle">{v.cycle}</span>}
      </button>
    );
  };
  return (
    <section
      aria-label="Your reading bookshelf"
      className="shrink-0 border-b border-ink-200 bg-paper-100"
    >
      <div className="px-4 pt-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl">Your reading shelf</h2>
          <p className="text-xs text-ink-500">
            Earlier reads to the left. Your next chapter to the right.
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setManage(!manage)}>
            Choose Up next
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed);
              positioned.current = false;
            }}
          >
            {collapsed ? "Show shelf" : "Hide shelf"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4">
          {error}
        </p>
      )}
      {manage && (
        <div
          className="px-4 py-3 space-y-2"
          aria-label="Choose books for Up next"
        >
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={showNext ?? data.showUpNext}
              disabled={busy}
              onChange={(e) =>
                void update("/api/bookshelf", { showUpNext: e.target.checked })
              }
            />{" "}
            Show my selected Up next books
          </label>
          <label className="block text-sm">
            Find a book to pin
            <input
              className="block border rounded w-full p-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="max-h-36 overflow-y-auto space-y-2">
            {data.choices
              .filter(
                (b) =>
                  ["tbr", "owned_unread", "wishlist", "interested"].includes(
                    b.shelf,
                  ) && b.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((b) => (
                <label key={b.id} className="block text-sm">
                  <input
                    type="checkbox"
                    checked={pins[b.id] ?? b.pinned}
                    disabled={busy}
                    onChange={(e) =>
                      void update(`/api/library/${b.id}`, {
                        shelfPinned: e.target.checked,
                      })
                    }
                  />{" "}
                  {b.title}
                </label>
              ))}
          </div>
          <p className="text-xs">
            Only selected books appear here. Add books to your TBR in{" "}
            <Link className="underline" href="/library">
              Library
            </Link>
            .
          </p>
        </div>
      )}
      {!collapsed && (
        <>
          <div className="flex justify-between px-4 pt-1">
            <button
              aria-label="Scroll to earlier books"
              className="p-2"
              onClick={() =>
                rail.current?.scrollBy({
                  left: -300,
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "auto"
                    : "smooth",
                })
              }
            >
              Earlier
            </button>
            <button
              aria-label="Scroll to upcoming books"
              className="p-2"
              onClick={() =>
                rail.current?.scrollBy({
                  left: 300,
                  behavior: matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "auto"
                    : "smooth",
                })
              }
            >
              Up next
            </button>
          </div>
          <div
            ref={rail}
            className="folio-shelf-rail"
            tabIndex={0}
            role="region"
            aria-label="Scrollable book timeline"
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                rail.current?.scrollBy({
                  left: e.key === "ArrowLeft" ? -200 : 200,
                });
              }
            }}
          >
            <div className="folio-shelf-group">
              <span className="folio-shelf-label">
                Read / {groups.read.length}
              </span>
              {groups.read.map(volume)}
              {!groups.read.length && (
                <p className="text-sm w-40 pb-6">
                  Your finished books will live here.
                </p>
              )}
            </div>
            <div
              ref={now}
              className="folio-shelf-group border-l border-ink-200"
            >
              <span className="folio-shelf-label">Reading now</span>
              {groups.current.map(volume)}
              {!groups.current.length && (
                <p className="text-sm w-32 pb-6">
                  A little room for your current read.
                </p>
              )}
            </div>
            {data.showUpNext && (
              <div className="folio-shelf-group border-l border-ink-200">
                <span className="folio-shelf-label">
                  Up next / {groups.next.length}
                </span>
                {groups.next.map(volume)}
                {!groups.next.length && (
                  <p className="text-sm w-36 pb-6">
                    Choose a few books to look forward to.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="folio-shelf-edge" />
        </>
      )}
      <Modal
        open={!!selected}
        onClose={() => {
          if (
            !journalDirty ||
            window.confirm("Discard your unsaved journal draft?")
          ) {
            setSelected(null);
            setJournalDirty(false);
          }
        }}
        title="Book journal"
        drawer
      >
        {selected && (
          <BookJournal
            key={selected}
            bookId={selected}
            onDirty={setJournalDirty}
          />
        )}
      </Modal>
    </section>
  );
}
