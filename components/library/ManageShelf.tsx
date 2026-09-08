"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
export function ManageShelf({
  shelf,
  onClose,
  onRenamed,
  onDeleted,
}: {
  shelf: { id: string; name: string };
  onClose: () => void;
  onRenamed: (shelf: { id: string; name: string }) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(shelf.name);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shelves/${shelf.id}`, {
        method: deleting ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(deleting ? {} : { body: JSON.stringify({ name }) }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "That didn't save. Try again.");
      if (deleting) onDeleted();
      else onRenamed(data.shelf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={deleting ? "Delete this shelf?" : "Manage shelf"}
    >
      <form onSubmit={save} className="space-y-4">
        {deleting ? (
          <p>
            Delete &ldquo;{shelf.name}&rdquo;? Its books will stay in your
            library and on their other shelves.
          </p>
        ) : (
          <label className="block text-sm">
            Shelf name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              className="mt-1"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-rose-600 text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            loading={busy}
            variant={deleting ? "danger" : "primary"}
          >
            {deleting ? "Delete shelf" : "Save name"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setDeleting(!deleting)}
          >
            {deleting ? "Keep shelf" : "Delete shelf..."}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
