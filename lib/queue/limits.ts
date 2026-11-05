/**
 * Which limits a unit-price check went past. The trace already carries the
 * numbers (variancePct, tolerancePct, extendedDiff, extendedCap), so this works
 * them out for display only. It never decides anything: the engine's result
 * and reason are the decision.
 */
import type { TraceEntry } from "../match/types";
import { describeTolerance, money } from "./traceFormat";

export interface LimitStatus {
  /** What the limit is, e.g. "±2%" or "$50.00 extended cap". */
  label: string;
  /** over: this limit was exceeded. within: checked and fine. info: nothing to compare (not a numeric limit). */
  status: "over" | "within" | "info";
  /** Short note for the reviewer, e.g. "over by 3.05 points". Empty unless over. */
  detail: string;
}

const points = (n: number) => `${n.toFixed(2)} point${n.toFixed(2) === "1.00" ? "" : "s"}`;

/** One entry per limit on the check. Checks without a percent or cap limit return a single info entry. */
export function limitStatuses(t: TraceEntry): LimitStatus[] {
  const out: LimitStatus[] = [];

  if (t.tolerancePct !== null && t.variancePct !== null) {
    const over = Math.abs(t.variancePct) - t.tolerancePct;
    out.push(
      over > 0
        ? { label: `±${t.tolerancePct}%`, status: "over", detail: `over by ${points(over)}` }
        : { label: `±${t.tolerancePct}%`, status: "within", detail: "" },
    );
  } else if (t.tolerancePct !== null) {
    out.push({ label: `±${t.tolerancePct}%`, status: "info", detail: "" });
  }

  if (t.extendedCap !== undefined && t.extendedDiff !== undefined) {
    const over = t.extendedDiff - t.extendedCap;
    out.push(
      over > 0
        ? { label: `${money(t.extendedCap)} extended cap`, status: "over", detail: `over by ${money(over)}` }
        : { label: `${money(t.extendedCap)} extended cap`, status: "within", detail: "" },
    );
  } else if (t.extendedCap !== undefined) {
    out.push({ label: `${money(t.extendedCap)} extended cap`, status: "info", detail: "" });
  }

  if (out.length === 0) return [{ label: describeTolerance(t), status: "info", detail: "" }];
  return out;
}
