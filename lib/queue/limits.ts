/**
 * Which limits a check went past, for display. The rule itself records which
 * limits it exceeded (TraceEntry.exceeded), worked out with exact math, so this
 * only labels them and never re-derives the decision. The engine's result and
 * reason are the decision.
 */
import { QTY_ORDERED_RULE, QTY_RECEIVED_RULE } from "../match/quantity";
import type { TraceEntry } from "../match/types";
import { describeTolerance, money } from "./traceFormat";

export interface LimitStatus {
  /** What the limit is, e.g. "±2%", "up to +0%" or "$50.00 extended cap". */
  label: string;
  /**
   * over: the rule says this limit was exceeded. within: the rule checked it and it held.
   * info: no marking, because the values aren't trusted (needs review), the trace
   * predates exceeded-limit records, or the check has no numeric limit.
   */
  status: "over" | "within" | "info";
  /** Short note for the reviewer, e.g. "over by 3.05 points". Empty unless over. */
  detail: string;
}

/** Quantity rules only guard against billing more than arrived or was ordered; billing less is a partial invoice. */
const ONE_SIDED = new Set<string>([QTY_RECEIVED_RULE, QTY_ORDERED_RULE]);

const points = (n: number) => `${n.toFixed(2)} point${n.toFixed(2) === "1.00" ? "" : "s"}`;
const cents = (n: number) => Math.round(n * 100);

/** "over by …" from the stored (rounded) numbers; "just over" when rounding hides the excess. */
function overBy(excess: number | null, format: (n: number) => string): string {
  if (excess === null || !Number.isFinite(excess)) return "";
  return excess > 0 ? `over by ${format(excess)}` : "just over";
}

function status(t: TraceEntry, limit: "pct" | "cap" | "abs", label: string, excess: () => number | null, format: (n: number) => string): LimitStatus {
  if (t.exceeded === undefined) return { label, status: "info", detail: "" };
  if (!t.exceeded.includes(limit)) return { label, status: "within", detail: "" };
  return { label, status: "over", detail: overBy(excess(), format) };
}

/** One entry per limit on the check. Checks without a numeric limit return a single info entry. */
export function limitStatuses(t: TraceEntry): LimitStatus[] {
  const out: LimitStatus[] = [];

  if (t.tolerancePct !== null) {
    const tol = t.tolerancePct;
    const label = ONE_SIDED.has(t.rule) ? `up to +${tol}%` : `±${tol}%`;
    out.push(status(t, "pct", label, () => (t.variancePct === null ? null : Math.abs(t.variancePct) - tol), points));
  }

  if (t.toleranceAbs !== undefined) {
    const tol = t.toleranceAbs;
    const excess = () =>
      typeof t.actual.value === "number" && typeof t.expected.value === "number"
        ? (Math.abs(cents(t.actual.value) - cents(t.expected.value)) - cents(tol)) / 100
        : null;
    out.push(status(t, "abs", `±${money(tol)}`, excess, money));
  }

  if (t.extendedCap !== undefined) {
    const cap = t.extendedCap;
    out.push(
      status(t, "cap", `${money(cap)} extended cap`, () => (t.extendedDiff === undefined ? null : (cents(t.extendedDiff) - cents(cap)) / 100), money),
    );
  }

  if (out.length === 0) return [{ label: describeTolerance(t), status: "info", detail: "" }];
  return out;
}
