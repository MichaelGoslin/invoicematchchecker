"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/match/decision";
import { isAgainstRecommendation, OVERRIDE_REASONS, overrideReasonText } from "@/lib/queue/overrideReasons";

const NAME_KEY = "imc-reviewer-name";

/** Approve or reject one stored set. Going against the recommendation needs a reason code or a note. */
export function DecisionActions({ setId, recommendation }: { setId: string; recommendation: Recommendation }) {
  const router = useRouter();
  const [actor, setActor] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActor(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);

  const reason = overrideReasonText(code, note);
  const needsReason = (action: "approve" | "reject") => isAgainstRecommendation(action, recommendation) && !reason;
  const blocked = (action: "approve" | "reject") => busy || !actor.trim() || needsReason(action);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(NAME_KEY, actor);
      } catch {}
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
        Your name
        <input value={actor} onChange={(e) => setActor(e.target.value)} maxLength={100} />
      </label>
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
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
