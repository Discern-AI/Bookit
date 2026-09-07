"use client";

// Toast / Notification — Implementation Brief §2.8.

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastVariant = "default" | "success" | "error" | "warning";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DOT_CLASS: Record<Exclude<ToastVariant, "default">, string> = {
  success: "bg-sage-100",
  error: "bg-rose-100",
  warning: "bg-amber-100",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "default") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="bg-ink-950 text-paper-50 rounded-md px-4 py-3 text-sm shadow-panel flex items-center gap-3 max-w-sm text-left"
          >
            {t.variant !== "default" && (
              <span aria-hidden className={["h-1.5 w-1.5 rounded-full flex-shrink-0", DOT_CLASS[t.variant]].join(" ")} />
            )}
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
