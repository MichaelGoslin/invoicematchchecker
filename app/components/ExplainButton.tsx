"use client";

import { useState } from "react";
import type { Explanation } from "@/lib/explain/explain";

/** Shows a set's plain-English explanation, asking for one on first click. Placeholder for Joan's design. */
export function ExplainButton({ setId, initial }: { setId: string; initial: Explanation | null }) {
  const [explanation, setExplanation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sets/${encodeURIComponent(setId)}/explanation`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setExplanation(json.explanation);
      else setError(json.error);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (explanation) {
    return (
      <div className="explanation">
        <p>{explanation.text}</p>
        <p className="muted">
          {explanation.source === "claude"
            ? "Plain-English summary by Claude. The checks above are the decision."
            : `The rules' own summary.${explanation.fallbackReason ? ` (${explanation.fallbackReason})` : ""}`}
        </p>
      </div>
    );
  }
  return (
    <div className="explanation">
      <button type="button" className="secondary" disabled={busy} onClick={load}>
        {busy ? "Explaining…" : "Explain in plain English"}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
