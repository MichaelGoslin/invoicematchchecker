import type { SetDecision } from "@/lib/match/decision";
import type { TraceEntry } from "@/lib/match/types";

const LABEL = { approve: "Recommend approve", review: "Needs review", reject: "Recommend reject" } as const;

/** One queue row: the recommendation, its summary, and the checks that drove it. Placeholder for Joan's design. */
export function DecisionRow({ decision, traces, title }: { decision: SetDecision; traces: TraceEntry[]; title: string }) {
  const shown = traces.filter((t) => t.result !== "pass");
  return (
    <li>
      <details className="row">
        <summary>
          <span className={`badge ${decision.recommendation}`}>{LABEL[decision.recommendation]}</span>
          <strong>{decision.setId}</strong>
          <span className="muted">{title}</span>
        </summary>
        <div className="body">
          <p>{decision.summary}</p>
          <p className="muted">
            {decision.counts.pass} passed · {decision.counts.fail} flagged · {decision.counts.needs_review} need review
          </p>
          {shown.map((t, i) => (
            <p className="check" key={i}>
              <span className={`badge ${t.result === "fail" ? "reject" : "review"}`}>
                {t.result === "fail" ? "Flagged" : "Needs review"}
              </span>{" "}
              {t.scope === "line" ? `Line ${t.lineIndex! + 1}: ` : ""}
              {t.reason} <code>{t.rule}</code>
            </p>
          ))}
        </div>
      </details>
    </li>
  );
}
