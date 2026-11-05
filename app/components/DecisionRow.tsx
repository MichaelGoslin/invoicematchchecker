import type { SetDecision } from "@/lib/match/decision";
import type { TraceEntry } from "@/lib/match/types";
import { TraceTable } from "./TraceTable";

const LABEL = { approve: "Recommend approve", review: "Needs review", reject: "Recommend reject" } as const;

/** One queue row: the recommendation and summary up front, the side-by-side checks when opened. */
export function DecisionRow({
  decision,
  traces,
  title,
  status,
  children,
}: {
  decision: SetDecision;
  traces: TraceEntry[];
  title: string;
  /** Shown after the title when a person has acted, e.g. "Approved by Joan (override)". */
  status?: string;
  /** Actions or extra detail, shown below the checks. */
  children?: React.ReactNode;
}) {
  return (
    <li>
      <details className="row">
        <summary>
          <span className={`badge ${decision.recommendation}`}>{LABEL[decision.recommendation]}</span>
          <strong>{decision.setId}</strong>
          <span className="muted">{title}</span>
          {status ? <span className="status">{status}</span> : null}
        </summary>
        <div className="body">
          <p>{decision.summary}</p>
          <p className="muted">
            {decision.counts.pass} passed · {decision.counts.fail} flagged · {decision.counts.needs_review} need review
          </p>
          <TraceTable traces={traces} />
          {children}
        </div>
      </details>
    </li>
  );
}
