"use client";
import { useEffect, useRef } from "react";
export function Modal({
  open,
  onClose,
  children,
  title = "Book details",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog?.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="w-full max-w-lg max-h-dialog overflow-y-auto bg-paper-50 text-ink-950 rounded-lg shadow-modal p-6 backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="font-display text-2xl">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="h-8 w-8 rounded hover:bg-ink-50 text-2xl"
        >
          &times;
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
