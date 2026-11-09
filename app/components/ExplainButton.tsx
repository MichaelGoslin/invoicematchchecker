"use client";

import { useState } from "react";
import type { Explanation } from "@/lib/explain/explain";

/** Shows a set's plain-English explanation, asking for one on first click. The checks above remain the decision. */
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
    const byClaude = explanation.source === "claude";
    return (
      <aside className="explanation" aria-label="Plain-English explanation">
        <h3>
          In plain English <span className={`source ${byClaude ? "claude" : "rules"}`}>{byClaude ? "written by Claude" : "from the rules"}</span>
        </h3>
        <p>{explanation.text}</p>
        <p className="muted">
          {byClaude
            ? "This only restates the checks above. It can't change the recommendation."
            : `Claude's text wasn't used, so this is the rules' own summary.${explanation.fallbackReason ? ` (${explanation.fallbackReason})` : ""}`}
        </p>
      </aside>
    );
  }
  return (
    <div className="explanation">
      <button type="button" className="secondary" disabled={busy} onClick={load}>
        {busy ? "Explaining…" : "Explain in plain English"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
