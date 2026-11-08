/**
 * Shared shapes for the match engine. The review-queue UI renders TraceEntry
 * directly, so treat changes here as a contract change with the UI.
 */

/** A value read from a document, with where it came from and how sure the read was. */
export interface SourcedValue<T extends number | string = number> {
  value: T;
  /** Human-readable location, e.g. "PO-1042 line 2". */
  source: string;
  /** Extraction confidence from 0 to 1. Typed-in, system or calculated-from-trusted values use 1. */
  confidence: number;
}

/**
 * pass: the check succeeded.
 * fail: the check ran on trusted values and found a mismatch.
 * needs_review: the check could not be trusted (low confidence or unusable input),
 *   so a person decides. Never treated as a pass.
 */
export type CheckResult = "pass" | "fail" | "needs_review";

/** Which part of the invoice a check is about, so the UI can group rows without parsing text. */
export type TraceScope = "header" | "line" | "totals";

/** Options every line-level rule accepts. */
export interface LineOptions {
  /** 0-based index of the invoice line. Source strings use 1-based "line N" for people. */
  lineIndex?: number;
}

/** One check's full record: values, sources, math, rule and outcome. */
export interface TraceEntry {
  rule: string;
  ruleVersion: string;
  scope: TraceScope;
  /** 0-based invoice line for scope "line"; null for header and totals checks. */
  lineIndex: number | null;
  /** What the documents say it should be (PO, receiving report, or a calculation). */
  expected: SourcedValue<number | string>;
  /** What the invoice says. */
  actual: SourcedValue<number | string>;
  /** Signed percent difference of actual vs expected, rounded to 2 places. Null for text checks or when it can't be computed. */
  variancePct: number | null;
  /** Allowed percent difference. Null for checks that use an absolute tolerance or exact text matching. */
  tolerancePct: number | null;
  /** Allowed absolute difference in dollars, for totals (rounding). Absent when not used. */
  toleranceAbs?: number;
  /** Unit price only: price difference × invoiced quantity, in dollars (always positive). Absent when no quantity was given. */
  extendedDiff?: number;
  /** Unit price only: the most the extended difference may be, in dollars. */
  extendedCap?: number;
  /**
   * Which limits the trusted values went past, worked out by the rule itself with
   * exact math: "pct" for tolerancePct, "cap" for extendedCap, "abs" for toleranceAbs.
   * Set on pass and fail only; absent on needs_review (the values aren't trusted)
   * and on traces stored before this field existed.
   */
  exceeded?: ("pct" | "cap" | "abs")[];
  /** The confidence floor that was applied to every value read. */
  minConfidence: number;
  result: CheckResult;
  /** Plain-English reason built from the numbers above. */
  reason: string;
}
