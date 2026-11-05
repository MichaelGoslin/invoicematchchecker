"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/match/decision";

const NAME_KEY = "imc-reviewer-name";

/** Approve or reject one stored set. A decision against the recommendation needs a reason. Placeholder for Joan's design. */
export function DecisionActions({ setId, recommendation }: { setId: string; recommendation: Recommendation }) {
  const router = useRouter();
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActor(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);

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
        Reason <span className="muted">(required to {recommendation === "approve" ? "reject" : "approve"} this set)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} />
      </label>
      <div className="buttons">
        <button type="button" disabled={busy || !actor.trim()} onClick={() => decide("approve")}>Approve</button>
        <button type="button" className="secondary" disabled={busy || !actor.trim()} onClick={() => decide("reject")}>Reject</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
