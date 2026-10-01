"use client";
import { useState } from "react";
import { parsePounds, pounds } from "@/lib/gifts";
export type Pledge = {
  id: string;
  version: number;
  label: string;
  mode: string;
  amountPence: number;
  capPence: number | null;
  receivedPence: number;
  expectedPence: number;
  outstandingPence: number;
  excessPence: number;
};
export type Campaign = {
  charityName: string;
  targetPence: number | null;
  version: number;
  pledges: Pledge[];
  expectedPence: number;
  receivedPence: number;
  outstandingPence: number;
  excessPence: number;
};
const amount = (n: number | null) => (n === null ? "" : (n / 100).toFixed(2));
export function Fundraising({
  challengeId,
  campaign,
  reload,
}: {
  challengeId: string;
  campaign: Campaign | null;
  reload: () => Promise<void>;
}) {
  const [setup, setSetup] = useState<{
    charityName: string;
    target: string;
    version: number | null;
  } | null>(null);
  const [draft, setDraft] = useState<{
      id: string;
      version: number;
      label: string;
      mode: string;
      amount: string;
      cap: string;
      received: string;
    } | null>(null),
    [remove, setRemove] = useState<Pledge | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const editing = !!setup || !!draft || !!remove;
  async function save(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/challenges/${challengeId}/fundraising`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await reload();
      setSetup(null);
      setDraft(null);
      setRemove(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  function saveSetup() {
    if (!setup) return;
    const targetPence = parsePounds(setup.target);
    if (targetPence === undefined || targetPence === 0) {
      setError(
        "Use a positive target in pounds with at most two decimal places, or leave it blank.",
      );
      return;
    }
    save({
      action: "campaign",
      charityName: setup.charityName,
      version: setup.version,
      targetPence,
    });
  }
  function savePledge() {
    if (!draft) return;
    const amountPence = parsePounds(draft.amount),
      capPence = draft.mode === "flat" ? null : parsePounds(draft.cap),
      receivedPence = parsePounds(draft.received);
    if (
      !amountPence ||
      capPence === undefined ||
      capPence === 0 ||
      receivedPence == null
    ) {
      setError(
        "Enter a positive pledge, an optional positive cap and an amount received (zero is allowed), using at most two decimal places.",
      );
      return;
    }
    save({
      action: "pledge",
      id: draft.id,
      version: draft.version,
      label: draft.label,
      mode: draft.mode,
      amountPence,
      capPence,
      receivedPence,
    });
  }
  function cancel() {
    setSetup(null);
    setDraft(null);
    setRemove(null);
    setError("");
  }
  const field = "block w-full border rounded p-2";
  return (
    <section aria-label="Charity tracking" className="border-t pt-3 space-y-3">
      <h3 className="font-display text-2xl">Charity read-a-thon</h3>
      <p className="text-sm">
        Private sponsorship records in GBP. Folio does not collect payments or
        contact sponsors. Per-book pledges follow this challenge&apos;s completed
        readings, including rereads, and change when reading history is
        corrected.
      </p>
      {campaign && (
        <>
          <p className="font-semibold break-words">{campaign.charityName}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt>Pledged from current progress</dt>
              <dd>{pounds(campaign.expectedPence)}</dd>
            </div>
            <div>
              <dt>Recorded as received</dt>
              <dd>{pounds(campaign.receivedPence)}</dd>
            </div>
            <div>
              <dt>Still to receive</dt>
              <dd>{pounds(campaign.outstandingPence)}</dd>
            </div>
            {campaign.targetPence !== null && (
              <div>
                <dt>Fundraising target</dt>
                <dd>{pounds(campaign.targetPence)}</dd>
              </div>
            )}
          </dl>
          {campaign.excessPence > 0 && (
            <p>
              Some received amounts exceed their current pledges by{" "}
              {pounds(campaign.excessPence)}. Check those records after reading
              corrections.
            </p>
          )}
          {campaign.targetPence !== null && (
            <progress
              className="w-full"
              aria-label="Fundraising received progress"
              max={campaign.targetPence}
              value={Math.min(campaign.targetPence, campaign.receivedPence)}
            />
          )}
          <p className="text-sm">
            Flat pledges count in full immediately. Optional caps limit per-book
            totals. Amounts received are entered by you and never changed
            automatically.
          </p>
          {campaign.pledges.map((p) => (
            <article key={p.id} className="border rounded p-3 space-y-2">
              <h4 className="font-semibold break-words">{p.label}</h4>
              <p>
                {pounds(p.amountPence)}{" "}
                {p.mode === "flat" ? "flat pledge" : "per completed book"}
                {p.capPence !== null ? ` (cap ${pounds(p.capPence)})` : ""}
              </p>
              <p>
                Current pledge: {pounds(p.expectedPence)}. Received:{" "}
                {pounds(p.receivedPence)}. Remaining:{" "}
                {pounds(p.outstandingPence)}.
              </p>
              <button
                className="underline"
                disabled={busy || editing}
                onClick={() => {
                  setError("");
                  setDraft({
                    id: p.id,
                    version: p.version,
                    label: p.label,
                    mode: p.mode,
                    amount: amount(p.amountPence),
                    cap: amount(p.capPence),
                    received: amount(p.receivedPence),
                  });
                }}
              >
                Edit pledge
              </button>{" "}
              <button
                className="underline"
                disabled={busy || editing}
                onClick={() => {
                  setError("");
                  setRemove(p);
                }}
              >
                Remove pledge
              </button>
            </article>
          ))}
          <button
            className="border rounded px-3 py-2"
            disabled={busy || editing}
            onClick={() => {
              setError("");
              setDraft({
                id: crypto.randomUUID(),
                version: 0,
                label: "",
                mode: "per_book",
                amount: "",
                cap: "",
                received: "0.00",
              });
            }}
          >
            Add sponsor pledge
          </button>
        </>
      )}
      {!editing && (
        <button
          className="underline block"
          onClick={() => {
            setError("");
            setSetup({
              charityName: campaign?.charityName || "",
              target: amount(campaign?.targetPence ?? null),
              version: campaign?.version ?? null,
            });
          }}
        >
          {campaign ? "Edit charity details" : "Set up charity tracking"}
        </button>
      )}
      {setup && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveSetup();
          }}
        >
          <label className="block">
            Charity name
            <input
              className={field}
              required
              maxLength={160}
              disabled={busy}
              value={setup.charityName}
              onChange={(e) =>
                setSetup({ ...setup, charityName: e.target.value })
              }
            />
          </label>
          <label className="block">
            Fundraising target (GBP, optional)
            <input
              className={field}
              inputMode="decimal"
              disabled={busy}
              value={setup.target}
              onChange={(e) => setSetup({ ...setup, target: e.target.value })}
            />
          </label>
          <button className="border rounded px-3 py-2" disabled={busy}>
            Save charity details
          </button>
        </form>
      )}
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            savePledge();
          }}
        >
          <label className="block">
            Sponsor label
            <input
              className={field}
              required
              maxLength={100}
              disabled={busy}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label className="block">
            Pledge type
            <select
              aria-label="Pledge type"
              className={field}
              disabled={busy}
              value={draft.mode}
              onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
            >
              <option value="per_book">Per completed book</option>
              <option value="flat">Flat amount</option>
            </select>
          </label>
          <label className="block">
            Pledge amount (GBP)
            <input
              className={field}
              inputMode="decimal"
              required
              disabled={busy}
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            />
          </label>
          {draft.mode === "per_book" && (
            <label className="block">
              Pledge cap (GBP, optional)
              <input
                className={field}
                inputMode="decimal"
                disabled={busy}
                value={draft.cap}
                onChange={(e) => setDraft({ ...draft, cap: e.target.value })}
              />
            </label>
          )}
          <label className="block">
            Recorded as received (GBP)
            <input
              className={field}
              inputMode="decimal"
              required
              disabled={busy}
              value={draft.received}
              onChange={(e) => setDraft({ ...draft, received: e.target.value })}
            />
          </label>
          <button className="border rounded px-3 py-2" disabled={busy}>
            Save pledge
          </button>
        </form>
      )}
      {remove && (
        <div>
          <p>
            Remove {remove.label}&apos;s pledge and its received record? Your reading
            history will be kept.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              save({ action: "delete", id: remove.id, version: remove.version })
            }
          >
            Confirm remove pledge
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {editing && (
        <button disabled={busy} className="underline" onClick={cancel}>
          Cancel charity edit
        </button>
      )}
      {error && (
        <button
          className="underline block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await reload();
              cancel();
            } catch {
              setError("Could not reload tracking. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Discard draft and reload tracking
        </button>
      )}
    </section>
  );
}
