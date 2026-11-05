import type { SourcedValue, TraceEntry } from "./types";

export const UNIT_PRICE_RULE = "unit_price_within_tolerance";
export const UNIT_PRICE_RULE_VERSION = "1";

export interface UnitPriceOptions {
  /** Allowed difference in either direction, as a percent of the PO price. Default 2. */
  tolerancePct?: number;
  /** Any value read below this confidence sends the check to a person. Default 0.9. */
  minConfidence?: number;
}

/** Work in ten-thousandths of a dollar so prices like 4.335 and the 2.00% boundary compare exactly. */
const SCALE = 10_000;
const toUnits = (n: number) => Math.round(n * SCALE);

/** $4.25, or $4.335 when the price has sub-cent precision. */
export const formatPrice = (n: number) => {
  const cents = Math.round(n * 100) / 100;
  return `$${cents === n ? n.toFixed(2) : n.toFixed(4).replace(/0+$/, "")}`;
};

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
  const minConfidence = options.minConfidence ?? 0.9;

  const base = {
    rule: UNIT_PRICE_RULE,
    ruleVersion: UNIT_PRICE_RULE_VERSION,
    expected,
    actual,
    tolerancePct,
    minConfidence,
  };

  const usable = (v: SourcedValue) => Number.isFinite(v.value) && Number.isFinite(v.confidence);
  if (!usable(expected) || !usable(actual) || expected.value <= 0 || actual.value < 0) {
    return {
      ...base,
      variancePct: null,
      result: "needs_review",
      reason: `Unit price could not be compared (PO ${expected.value}, invoice ${actual.value}). A person needs to check the documents.`,
    };
  }

  const expectedUnits = toUnits(expected.value);
  const diffUnits = toUnits(actual.value) - expectedUnits;
  const variancePct = Math.round((diffUnits / expectedUnits) * 100 * 100) / 100;

  // Fail-safe: an uncertain read never produces pass or fail, whatever the math says.
  const lowReads = [expected, actual].filter((v) => v.confidence < minConfidence);
  if (lowReads.length > 0) {
    const which = lowReads
      .map((v) => `${v.source} read at confidence ${v.confidence.toFixed(2)}`)
      .join(" and ");
    return {
      ...base,
      variancePct,
      result: "needs_review",
      reason: `Uncertain reading: ${which}, below the ${minConfidence.toFixed(2)} minimum. A person must confirm the price before it is trusted.`,
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
  const pct = `${variancePct > 0 ? "+" : ""}${variancePct.toFixed(2)}%`;
  const compared = `Unit price ${formatPrice(actual.value)} (${actual.source}) vs PO ${formatPrice(expected.value)} (${expected.source}) is ${pct}`;

  return {
    ...base,
    variancePct,
    result: withinTolerance ? "pass" : "fail",
    reason: withinTolerance
      ? `${compared}, within the ${tolerancePct}% tolerance.`
      : `${compared} ${direction}, beyond the ${tolerancePct}% tolerance.`,
  };
}
