"use client";

import { useState } from "react";
import type { SetDecision } from "@/lib/match/decision";
import type { TraceEntry } from "@/lib/match/types";
import { DecisionRow } from "../components/DecisionRow";

interface MatchResponse {
  setId: string;
  decision: SetDecision;
  traces: TraceEntry[];
  documents: { name: string; model: string; guardNotes: string[]; document: { document_type: string; reading_problems: string[] } }[];
}

/** Minimal harness for /api/match. Joan's upload screen replaces this. */
export function TryForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResponse | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    for (const slot of ["purchaseOrder", "receivingReport"]) {
      const f = form.get(slot);
      if (f instanceof File && f.size === 0) form.delete(slot);
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/match", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? `Request failed (${res.status}).`);
      else setResult(body);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Purchase order <span className="muted">(without one, the set is recommended for rejection)</span>
          <input type="file" name="purchaseOrder" accept=".pdf,.png,.jpg,.jpeg,.txt" />
        </label>
        <label>
          Receiving report <span className="muted">(without one, the set needs review)</span>
          <input type="file" name="receivingReport" accept=".pdf,.png,.jpg,.jpeg,.txt" />
        </label>
        <label>
          Invoice
          <input type="file" name="invoice" accept=".pdf,.png,.jpg,.jpeg,.txt" required />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Reading documents…" : "Check set"}</button>
      </form>

      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <>
          <h2>Result</h2>
          <ul className="queue">
            <DecisionRow decision={result.decision} traces={result.traces} title="uploaded set" />
          </ul>
          <h2>What Claude read</h2>
          {result.documents.map((d) => (
            <div key={d.name}>
              <p className="check">
                <strong>{d.name}</strong> <span className="muted">read as {d.document.document_type} by {d.model}</span>
              </p>
              {[...d.document.reading_problems, ...d.guardNotes].length > 0 ? (
                <ul className="notes">
                  {[...d.document.reading_problems, ...d.guardNotes].map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
