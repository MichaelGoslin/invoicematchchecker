import type { TraceEntry } from "@/lib/match/types";
import { checkWhere, describeTolerance, describeVariance, formatValue, resultLabel, ruleName } from "@/lib/queue/traceFormat";

function Table({ traces }: { traces: TraceEntry[] }) {
  return (
    <div className="table-wrap">
      <table className="trace">
        <thead>
          <tr>
            <th>Where</th>
            <th>Check</th>
            <th>PO / receiving says</th>
            <th>Invoice says</th>
            <th>Difference</th>
            <th>Allowed</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t, i) => (
            <tr key={i} className={t.result}>
              <td>{checkWhere(t)}</td>
              <td>
                {ruleName(t.rule)}
                <div className="muted small">{t.reason}</div>
              </td>
              <td className="num">
                {formatValue(t.rule, t.expected.value)}
                <div className="muted small">{t.expected.source}</div>
              </td>
              <td className="num">
                {formatValue(t.rule, t.actual.value)}
                <div className="muted small">
                  {t.actual.source}
                  {t.actual.confidence < t.minConfidence ? ` · read at ${t.actual.confidence.toFixed(2)}` : ""}
                </div>
              </td>
              <td className="num">{describeVariance(t)}</td>
              <td>{describeTolerance(t)}</td>
              <td>
                <span className={`badge ${t.result === "pass" ? "approve" : t.result === "fail" ? "reject" : "review"}`}>
                  {resultLabel[t.result]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Expected against actual for every check that needs attention, with the passed checks one click away. */
export function TraceTable({ traces }: { traces: TraceEntry[] }) {
  const attention = traces.filter((t) => t.result !== "pass");
  const passed = traces.filter((t) => t.result === "pass");
  return (
    <>
      {attention.length > 0 ? <Table traces={attention} /> : <p className="muted">Every check passed.</p>}
      {passed.length > 0 ? (
        <details className="passed">
          <summary>
            {passed.length} passed check{passed.length === 1 ? "" : "s"}
          </summary>
          <Table traces={passed} />
        </details>
      ) : null}
    </>
  );
}
