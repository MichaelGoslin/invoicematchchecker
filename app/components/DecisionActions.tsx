"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Recommendation } from "@/lib/match/decision";
import { decisionBlockedReason } from "@/lib/queue/bulkHints";
import { OVERRIDE_REASONS, overrideReasonText } from "@/lib/queue/overrideReasons";
import { useReviewer } from "./ReviewerName";

/** Approve or reject one stored set. Going against the recommendation needs a reason code or a note. */
export function DecisionActions({ setId, recommendation }: { setId: string; recommendation: Recommendation }) {
  const router = useRouter();
  const { name: actor } = useReviewer();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hintId = useId();
  const reason = overrideReasonText(code, note);
  const approveOff = decisionBlockedReason("approve", recommendation, actor, reason);
  const rejectOff = decisionBlockedReason("reject", recommendation, actor, reason);
  // Both off for the same reason (no name yet): say it once.
  const hints = [...new Set([approveOff, rejectOff].filter((h): h is string => h !== null))];

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sets/${encodeURIComponent(setId)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, actor, reason }),
      });
      if (!res.ok) setError((await res.json()).error ?? `Failed (${res.status}).`);
      else router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions">
      <label>
        Reason code <span className="muted">(needed to {recommendation === "approve" ? "reject" : "approve"} this set)</span>
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Choose a reason…</option>
          {OVERRIDE_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Note <span className="muted">(optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1900} />
      </label>
      <div className="buttons">
        <button type="button" disabled={busy || approveOff !== null} aria-describedby={approveOff ? hintId : undefined} onClick={() => decide("approve")}>
          Approve
        </button>
        <button type="button" className="secondary" disabled={busy || rejectOff !== null} aria-describedby={rejectOff ? hintId : undefined} onClick={() => decide("reject")}>
          Reject
        </button>
      </div>
      {hints.length > 0 ? (
        <p id={hintId} className="hint">
          {hints.join(" ")}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
