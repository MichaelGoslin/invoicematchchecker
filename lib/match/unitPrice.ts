import {
  DEFAULT_MIN_CONFIDENCE,
  formatPct,
  formatPrice,
  isUsableNumber,
  pctOf,
  toUnits,
  uncertainReading,
} from "./shared";
import type { SourcedValue, TraceEntry } from "./types";

export { formatPrice } from "./shared";

export const UNIT_PRICE_RULE = "unit_price_within_tolerance";
export const UNIT_PRICE_RULE_VERSION = "1";

export interface UnitPriceOptions {
  /** Allowed difference in either direction, as a percent of the PO price. Default 2. */
  tolerancePct?: number;
  /** Any value read below this confidence sends the check to a person. Default 0.9. */
  minConfidence?: number;
}

/**
 * Compares the invoice unit price to the PO unit price and returns a trace entry
 * that shows its own work. Uncertain or unusable inputs return needs_review,
 * never pass.
 */
export function checkUnitPrice(
  expected: SourcedValue,
  actual: SourcedValue,
  options: UnitPriceOptions = {},
): TraceEntry {
  const tolerancePct = options.tolerancePct ?? 2;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const base = {
    rule: UNIT_PRICE_RULE,
    ruleVersion: UNIT_PRICE_RULE_VERSION,
    expected,
    actual,
    tolerancePct,
    minConfidence,
  };

  if (!isUsableNumber(expected) || !isUsableNumber(actual) || expected.value === 0) {
    return {
      ...base,
      variancePct: null,
      result: "needs_review",
      reason: `Unit price could not be compared (PO ${expected.value}, invoice ${actual.value}). A person needs to check the documents.`,
    };
  }

  const expectedUnits = toUnits(expected.value);
  const diffUnits = toUnits(actual.value) - expectedUnits;
  const variancePct = pctOf(diffUnits, expectedUnits) ?? 0;

  // Fail-safe: an uncertain read never produces pass or fail, whatever the math says.
  const uncertain = uncertainReading([expected, actual], minConfidence);
  if (uncertain) {
    return {
      ...base,
      variancePct,
      result: "needs_review",
      reason: `${uncertain} A person must confirm the price before it is trusted.`,
    };
  }

  if (diffUnits === 0) {
    return {
      ...base,
      variancePct: 0,
      result: "pass",
      reason: `Unit price ${formatPrice(actual.value)} matches the PO exactly.`,
    };
  }

  // |diff| / expected <= tolerance%, written without division so the boundary is exact.
  const withinTolerance = Math.abs(diffUnits) * 100 <= tolerancePct * expectedUnits;
  const direction = diffUnits > 0 ? "over" : "under";
  const compared = `Unit price ${formatPrice(actual.value)} (${actual.source}) vs PO ${formatPrice(expected.value)} (${expected.source}) is ${formatPct(variancePct)}`;

  return {
    ...base,
    variancePct,
    result: withinTolerance ? "pass" : "fail",
    reason: withinTolerance
      ? `${compared}, within the ${tolerancePct}% tolerance.`
      : `${compared} ${direction}, beyond the ${tolerancePct}% tolerance.`,
  };
}
