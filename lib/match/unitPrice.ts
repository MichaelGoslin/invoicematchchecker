import {
  DEFAULT_MIN_CONFIDENCE,
  formatPct,
  formatPrice,
  isUsableNumber,
  pctOf,
  toUnits,
  uncertainReading,
} from "./shared";
import type { LineOptions, SourcedValue, TraceEntry } from "./types";

export { formatPrice } from "./shared";

export const UNIT_PRICE_RULE = "unit_price_within_tolerance";
export const UNIT_PRICE_RULE_VERSION = "2";

export interface UnitPriceOptions extends LineOptions {
  /** Allowed difference in either direction, as a percent of the PO price. Default 2. */
  tolerancePct?: number;
  /** Any value read below this confidence sends the check to a person. Default 0.9. */
  minConfidence?: number;
  /**
   * Invoiced quantity for this line. When given, the price difference times the
   * quantity must also stay within `maxExtendedDiff`, so a small percent on a big
   * line can't add up to a large overpayment.
   */
  quantity?: SourcedValue;
  /** Largest allowed extended difference in dollars. Default 50. */
  maxExtendedDiff?: number;
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
  const quantity = options.quantity;
  const extendedCap = quantity ? (options.maxExtendedDiff ?? 50) : undefined;

  const base = {
    rule: UNIT_PRICE_RULE,
    ruleVersion: UNIT_PRICE_RULE_VERSION,
    scope: "line" as const,
    lineIndex: options.lineIndex ?? null,
    expected,
    actual,
    tolerancePct,
    minConfidence,
    ...(extendedCap === undefined ? {} : { extendedCap }),
  };

  const inputs = quantity ? [expected, actual, quantity] : [expected, actual];
  if (!inputs.every(isUsableNumber) || expected.value === 0) {
    return {
      ...base,
      variancePct: null,
      result: "needs_review",
      reason: `Unit price could not be compared (PO ${expected.value}, invoice ${actual.value}${quantity ? `, quantity ${quantity.value}` : ""}). A person needs to check the documents.`,
    };
  }

  const expectedUnits = toUnits(expected.value);
  const diffUnits = toUnits(actual.value) - expectedUnits;
  const variancePct = pctOf(diffUnits, expectedUnits) ?? 0;

  // Price difference × quantity, exact: both sides are in ten-thousandths, so the product is in 1e-8 dollars.
  const extendedRaw = quantity ? BigInt(Math.abs(diffUnits)) * BigInt(toUnits(quantity.value)) : undefined;
  const extendedDiff = extendedRaw === undefined ? undefined : Math.round(Number(extendedRaw) / 1e6) / 100;
  const extended = extendedDiff === undefined ? {} : { extendedDiff };

  // Fail-safe: an uncertain read never produces pass or fail, whatever the math says.
  const uncertain = uncertainReading(inputs, minConfidence);
  if (uncertain) {
    return {
      ...base,
      ...extended,
      variancePct,
      result: "needs_review",
      reason: `${uncertain} A person must confirm the price before it is trusted.`,
    };
  }

  if (diffUnits === 0) {
    return {
      ...base,
      ...extended,
      variancePct: 0,
      result: "pass",
      reason: `Unit price ${formatPrice(actual.value)} matches the PO exactly.`,
    };
  }

  // |diff| / expected <= tolerance%, written without division so the boundary is exact.
  const withinPct = Math.abs(diffUnits) * 100 <= tolerancePct * expectedUnits;
  const withinCap =
    extendedRaw === undefined || extendedRaw <= BigInt(toUnits(extendedCap!)) * 10_000n;
  const direction = diffUnits > 0 ? "over" : "under";
  const compared = `Unit price ${formatPrice(actual.value)} (${actual.source}) vs PO ${formatPrice(expected.value)} (${expected.source}) is ${formatPct(variancePct)}`;
  const capText =
    quantity && extendedDiff !== undefined
      ? `× ${quantity.value} units = ${formatPrice(extendedDiff)} ${direction}, ${withinCap ? "within" : "beyond"} the ${formatPrice(extendedCap!)} cap`
      : "";

  let reason: string;
  if (!withinPct) {
    reason = `${compared} ${direction}, beyond the ${tolerancePct}% tolerance.`;
  } else if (!withinCap) {
    reason = `${compared}, within the ${tolerancePct}% tolerance, but ${capText}.`;
  } else {
    reason = `${compared}, within the ${tolerancePct}% tolerance${capText ? ` (${capText})` : ""}.`;
  }

  return {
    ...base,
    ...extended,
    variancePct,
    result: withinPct && withinCap ? "pass" : "fail",
    reason,
  };
}
