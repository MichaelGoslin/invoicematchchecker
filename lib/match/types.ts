/**
 * Shared shapes for the match engine. The review-queue UI renders TraceEntry
 * directly, so treat changes here as a contract change with the UI.
 */

/** A value read from a document, with where it came from and how sure the read was. */
export interface SourcedValue {
  value: number;
  /** Human-readable location, e.g. "PO-1042 line 2". */
  source: string;
  /** Extraction confidence from 0 to 1. Typed-in or system values use 1. */
  confidence: number;
}

/**
 * pass: the check succeeded.
 * fail: the check ran on trusted values and found a mismatch.
 * needs_review: the check could not be trusted (low confidence or unusable input),
 *   so a person decides. Never treated as a pass.
 */
export type CheckResult = "pass" | "fail" | "needs_review";

/** One check's full record: values, sources, math, rule and outcome. */
export interface TraceEntry {
  rule: string;
  ruleVersion: string;
  expected: SourcedValue;
  actual: SourcedValue;
  /** Signed percent difference of actual vs expected, rounded to 2 places. Null when it can't be computed. */
  variancePct: number | null;
  tolerancePct: number;
  /** The confidence floor that was applied to both values. */
  minConfidence: number;
  result: CheckResult;
  /** Plain-English reason built from the numbers above. */
  reason: string;
}
