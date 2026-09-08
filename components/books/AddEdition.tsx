"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AddBook } from "@/components/library/AddBook";
import type { OpenLibrarySearchResult } from "@/lib/openLibrary";
export function AddEdition({ book }: { book: OpenLibrarySearchResult }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add to library</Button>
      {open && (
        <AddBook
          initialBook={book}
          defaultShelf="tbr"
          onClose={() => setOpen(false)}
          onAdded={(b) => {
            setOpen(false);
            router.push(`/library?book=${encodeURIComponent(b.id)}`);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
