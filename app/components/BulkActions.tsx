"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useReviewer } from "./ReviewerName";
import { approveBlockedReason, approvedMessage, approveLabel, exportBlockedReason, exportLabel, readyLine } from "@/lib/queue/bulkHints";

/**
 * Story 5: approve every clean set in one confirmed click, then export approved
 * sets for the ERP. Each button says what it will do, and why it is off when it is.
 */
export function BulkActions({ cleanCount, exportCount }: { cleanCount: number; exportCount: number }) {
  const router = useRouter();
  const nameId = useId();
  const { name: actor } = useReviewer();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const approveBlocked = approveBlockedReason(cleanCount, actor);
  const exportBlocked = exportBlockedReason(exportCount, actor);

  async function approveClean() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sets/approve-clean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor }),
      });
      const json = await res.json();
      setMessage(res.ok ? { text: approvedMessage(json.approved.length, json.skipped?.length ?? 0), ok: true } : { text: json.error, ok: false });
      router.refresh();
    } catch {
      setMessage({ text: "Could not reach the server.", ok: false });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor }),
      });
      if (!res.ok) {
        setMessage({ text: (await res.json()).error, ok: false });
        return;
      }
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "approved-invoices.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: `Exported ${res.headers.get("x-export-count")} approved set(s) to ${name}.`, ok: true });
      router.refresh();
    } catch {
      setMessage({ text: "Could not reach the server.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bulk" aria-label="Bulk actions">
      <p className="bulk-ready">{readyLine(cleanCount, exportCount)}</p>

      {confirming ? (
        <div className="buttons" role="group" aria-label="Confirm approving all clean sets">
          <span>
            Approve {cleanCount} clean set{cleanCount === 1 ? "" : "s"} as <strong>{actor.trim()}</strong>?
          </span>
          <button type="button" disabled={busy} onClick={approveClean}>
            {busy ? "Approving…" : "Yes, approve all"}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="buttons">
          <button type="button" disabled={busy || approveBlocked !== null} aria-describedby={approveBlocked ? `${nameId}-approve` : undefined} onClick={() => setConfirming(true)}>
            {approveLabel(cleanCount)}
          </button>
          <button type="button" className="secondary" disabled={busy || exportBlocked !== null} aria-describedby={exportBlocked ? `${nameId}-export` : undefined} onClick={exportCsv}>
            {exportLabel(exportCount)}
          </button>
        </div>
      )}

      {!confirming && (approveBlocked || exportBlocked) ? (
        <ul className="notes">
          {approveBlocked ? <li id={`${nameId}-approve`}>Approve all: {approveBlocked}</li> : null}
          {exportBlocked ? <li id={`${nameId}-export`}>Export: {exportBlocked}</li> : null}
        </ul>
      ) : null}
      {message ? (
        <p className={message.ok ? "bulk-ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
