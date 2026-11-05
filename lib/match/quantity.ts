import {
  DEFAULT_MIN_CONFIDENCE,
  formatPct,
  isUsableNumber,
  pctOf,
  shown,
  toUnits,
  uncertainReading,
} from "./shared";
import type { LineOptions, SourcedValue, TraceEntry } from "./types";

export const QTY_RECEIVED_RULE = "quantity_not_over_received";
export const QTY_ORDERED_RULE = "quantity_not_over_ordered";
export const QUANTITY_RULE_VERSION = "1";

export interface QuantityOptions extends LineOptions {
  /** Allowed overbill as a percent of the limit. Default 0: billing for more than arrived is flagged. */
  tolerancePct?: number;
  minConfidence?: number;
}

/**
 * Shared logic: the invoice may bill up to the limit (received or ordered).
 * Billing less is a partial invoice and passes; billing more is flagged.
 */
function checkNotOver(
  rule: string,
  noun: "received" | "ordered",
  limit: SourcedValue,
  invoiced: SourcedValue,
  options: QuantityOptions,
): TraceEntry {
  const tolerancePct = options.tolerancePct ?? 0;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const base = { rule, ruleVersion: QUANTITY_RULE_VERSION, scope: "line" as const, lineIndex: options.lineIndex ?? null, expected: limit, actual: invoiced, tolerancePct, minConfidence };

  if (!isUsableNumber(limit) || !isUsableNumber(invoiced)) {
    return {
      ...base,
      variancePct: null,
      result: "needs_review",
      reason: `Quantity could not be compared (${noun} ${shown(limit.value)}, invoiced ${shown(invoiced.value)}). A person needs to check the documents.`,
    };
  }

  const limitUnits = toUnits(limit.value);
  const diffUnits = toUnits(invoiced.value) - limitUnits;
  const variancePct = pctOf(diffUnits, limitUnits);

  const uncertain = uncertainReading([limit, invoiced], minConfidence);
  if (uncertain) {
    return { ...base, variancePct, result: "needs_review", reason: `${uncertain} A person must confirm the quantity before it is trusted.` };
  }

  const billed = `Invoiced ${invoiced.value} (${invoiced.source})`;
  const against = `${limit.value} ${noun} (${limit.source})`;

  if (diffUnits === 0) {
    return { ...base, variancePct: 0, result: "pass", reason: `${billed} matches the ${against}.` };
  }
  if (diffUnits < 0) {
    return {
      ...base,
      variancePct,
      result: "pass",
      reason: `${billed} is less than the ${against}: a partial invoice, not an overbill.`,
    };
  }

  const within = limitUnits > 0 && diffUnits * 100 <= tolerancePct * limitUnits;
  const extra = Math.round(diffUnits) / 10_000;
  if (limitUnits === 0) {
    return { ...base, variancePct, result: "fail", reason: `${billed}, but 0 ${noun} (${limit.source}).` };
  }
  return {
    ...base,
    variancePct,
    result: within ? "pass" : "fail",
    reason: within
      ? `${billed} is ${extra} more than the ${against} (${formatPct(variancePct!)}), within the ${tolerancePct}% tolerance.`
      : `${billed} is ${extra} more than the ${against} (${formatPct(variancePct!)}), beyond the ${tolerancePct}% tolerance.`,
  };
}

/** 3-way match: never pay for more than the receiving report shows arrived. */
export const checkQuantityReceived = (received: SourcedValue, invoiced: SourcedValue, options: QuantityOptions = {}) =>
  checkNotOver(QTY_RECEIVED_RULE, "received", received, invoiced, options);

/** 2-way and 3-way match: never pay for more than the PO ordered. */
export const checkQuantityOrdered = (ordered: SourcedValue, invoiced: SourcedValue, options: QuantityOptions = {}) =>
  checkNotOver(QTY_ORDERED_RULE, "ordered", ordered, invoiced, options);
