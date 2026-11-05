/**
 * Turns one invoice set's traces into a single recommendation. Code decides;
 * Claude only explains. A person approves every payment.
 */
import { DUPLICATE_RULE } from "./duplicate";
import { PO_NUMBER_RULE, VENDOR_RULE } from "./identity";
import { INVOICE_TOTAL_RULE } from "./totals";
import type { TraceEntry } from "./types";
import { UNIT_PRICE_RULE } from "./unitPrice";

export const DECISION_VERSION = "1";

export type Recommendation = "approve" | "review" | "reject";

/**
 * Why a set landed where it did. The review queue sorts on this:
 * reject, then gated, then exception, then incomplete, then clean.
 *
 * reject: a check failed that should stop payment (e.g. duplicate, wrong vendor).
 * gated: at least one value was read uncertainly. Never recommended for approval.
 * exception: values were trusted but a check failed (price, quantity, totals, PO number).
 * incomplete: a required check never ran, so the set can't be called clean.
 * clean: every required check ran and passed.
 */
export type DecisionReason = "reject" | "gated" | "exception" | "incomplete" | "clean";

export interface SetDecision {
  setId: string;
  recommendation: Recommendation;
  reason: DecisionReason;
  /** True when any value was read below the confidence floor. A gated set is never "approve". */
  gated: boolean;
  /** The traces that drove the decision, in the order they ran. Empty for a clean set. */
  drivers: TraceEntry[];
  /** Required rules that had no trace. */
  missingRules: string[];
  counts: { pass: number; fail: number; needs_review: number };
  /** One sentence for the queue row. */
  summary: string;
  decisionVersion: string;
}

/** Failing any of these recommends rejection rather than review. */
export const REJECT_RULES: readonly string[] = [DUPLICATE_RULE, VENDOR_RULE];

/** A set can't be approved unless each of these ran at least once. */
export const REQUIRED_RULES: readonly string[] = [
  VENDOR_RULE,
  PO_NUMBER_RULE,
  DUPLICATE_RULE,
  UNIT_PRICE_RULE,
  INVOICE_TOTAL_RULE,
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function decideSet(setId: string, traces: TraceEntry[]): SetDecision {
  const counts = { pass: 0, fail: 0, needs_review: 0 };
  for (const t of traces) counts[t.result]++;

  const ran = new Set(traces.map((t) => t.rule));
  const missingRules = REQUIRED_RULES.filter((r) => !ran.has(r));
  const uncertain = traces.filter((t) => t.result === "needs_review");
  const rejects = traces.filter((t) => t.result === "fail" && REJECT_RULES.includes(t.rule));
  const exceptions = traces.filter((t) => t.result === "fail" && !REJECT_RULES.includes(t.rule));
  const gated = uncertain.length > 0;

  const make = (
    recommendation: Recommendation,
    reason: DecisionReason,
    drivers: TraceEntry[],
    summary: string,
  ): SetDecision => ({
    setId,
    recommendation,
    reason,
    gated,
    drivers,
    missingRules,
    counts,
    summary,
    decisionVersion: DECISION_VERSION,
  });

  // Order matters. Uncertainty outranks everything: a rejection built on a
  // misread value is no more trustworthy than an approval built on one.
  if (gated) {
    const extra = rejects.length + exceptions.length;
    return make(
      "review",
      "gated",
      [...uncertain, ...rejects, ...exceptions],
      `Needs review: ${plural(uncertain.length, "check")} rely on uncertain or unreadable values${extra ? `, and ${plural(extra, "other check")} failed` : ""}.`,
    );
  }
  if (rejects.length > 0) {
    return make("reject", "reject", [...rejects, ...exceptions], `Recommend reject: ${rejects[0]!.reason}`);
  }
  if (exceptions.length > 0) {
    return make(
      "review",
      "exception",
      exceptions,
      exceptions.length === 1 ? `Needs review: ${exceptions[0]!.reason}` : `Needs review: ${plural(exceptions.length, "check")} failed.`,
    );
  }
  if (missingRules.length > 0) {
    return make("review", "incomplete", [], `Needs review: required checks did not run (${missingRules.join(", ")}).`);
  }
  return make("approve", "clean", [], `Recommend approve: all ${plural(traces.length, "check")} passed.`);
}

const QUEUE_ORDER: Record<DecisionReason, number> = { reject: 0, gated: 1, exception: 2, incomplete: 3, clean: 4 };

/** Sort comparator for the review queue: rejects, then gated, then other Needs review, then approve. */
export const compareForQueue = (a: SetDecision, b: SetDecision) =>
  QUEUE_ORDER[a.reason] - QUEUE_ORDER[b.reason] || b.drivers.length - a.drivers.length || a.setId.localeCompare(b.setId);
