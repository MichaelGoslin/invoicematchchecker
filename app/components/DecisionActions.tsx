"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Recommendation } from "@/lib/match/decision";
import { decisionBlockedReason } from "@/lib/queue/decisionHints";
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

  const reason = overrideReasonText(code, note);
  const why = (action: "approve" | "reject") => decisionBlockedReason(action, recommendation, actor, reason);
  const blocked = (action: "approve" | "reject") => busy || why(action) !== null;
  const nameMissing = !actor.trim();
  const approveWhy = why("approve");
  const rejectWhy = why("reject");

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
        <button type="button" disabled={blocked("approve")} onClick={() => decide("approve")}>
          Approve
        </button>
        <button type="button" className="secondary" disabled={blocked("reject")} onClick={() => decide("reject")}>
          Reject
        </button>
      </div>
      {nameMissing ? (
        <p className="muted hint" role="status">
          <a
            href="#reviewer-name"
            onClick={(e) => {
              e.preventDefault();
              const field = document.getElementById("reviewer-name");
              field?.scrollIntoView({ block: "center" });
              field?.focus();
            }}
          >
            Enter your name at the top of the queue
          </a>{" "}
          to approve or reject. It is saved with every decision.
        </p>
      ) : approveWhy || rejectWhy ? (
        <ul className="notes hint">
          {approveWhy ? <li>Approve: {approveWhy}</li> : null}
          {rejectWhy ? <li>Reject: {rejectWhy}</li> : null}
        </ul>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
