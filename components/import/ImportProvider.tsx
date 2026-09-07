"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
export interface ImportStatus {
  id: string;
  status: string;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  errors: string[];
}
const Context = createContext<{
  job: ImportStatus | null;
  setJob: (job: ImportStatus) => void;
  error: string;
  retry: () => void;
} | null>(null);
export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<ImportStatus | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const { toast } = useToast();
  const retry = useCallback(() => setError(""), []);
  useEffect(() => {
    let active = true;
    fetch("/api/import/goodreads")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.job) setJob(data.job);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!job || job.status === "complete" || error) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/import/status/${job.id}`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Import paused. Try again.");
        if (!active) return;
        setJob(data.job);
        if (data.job.status === "complete") {
          toast(`${data.job.imported} books imported.`, "success");
          router.refresh();
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Import paused. Try again.",
          );
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job, error, router, toast]);
  return (
    <Context.Provider value={{ job, setJob, error, retry }}>
      {children}
    </Context.Provider>
  );
}
export function useImport() {
  const context = useContext(Context);
  if (!context) throw new Error("ImportProvider missing");
  return context;
}
