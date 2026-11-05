import {
  DEFAULT_MIN_CONFIDENCE,
  formatPct,
  formatPrice,
  isUsableNumber,
  pctOf,
  toCents,
  uncertainReading,
  weakest,
} from "./shared";
import type { SourcedValue, TraceEntry } from "./types";

export const LINE_TOTAL_RULE = "line_total_equals_qty_times_price";
export const INVOICE_TOTAL_RULE = "invoice_total_equals_sum";
export const TOTALS_RULE_VERSION = "1";

export interface TotalsOptions {
  /** Allowed rounding difference in dollars. Default 0.01. */
  toleranceAbs?: number;
  minConfidence?: number;
}

/** Compares a stated total to one the engine calculated, in whole cents. */
function compareTotal(
  rule: string,
  label: string,
  inputs: SourcedValue[],
  calculated: SourcedValue,
  stated: SourcedValue,
  options: TotalsOptions,
): TraceEntry {
  const toleranceAbs = options.toleranceAbs ?? 0.01;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const base = {
    rule,
    ruleVersion: TOTALS_RULE_VERSION,
    expected: calculated,
    actual: stated,
    tolerancePct: null,
    toleranceAbs,
    minConfidence,
  };

  const diffCents = toCents(stated.value) - toCents(calculated.value);
  const variancePct = pctOf(diffCents, toCents(calculated.value));

  // Check every input, not just the calculated value, so the reason names the weak read.
  const uncertain = uncertainReading([...inputs, stated], minConfidence);
  if (uncertain) {
    return { ...base, variancePct, result: "needs_review", reason: `${uncertain} A person must confirm the ${label} before it is trusted.` };
  }

  const compared = `Stated ${label} ${formatPrice(stated.value)} (${stated.source}) vs calculated ${formatPrice(calculated.value)} (${calculated.source})`;
  if (diffCents === 0) {
    return { ...base, variancePct: 0, result: "pass", reason: `${compared}: exact match.` };
  }
  const within = Math.abs(diffCents) <= toCents(toleranceAbs);
  const off = formatPrice(Math.abs(diffCents) / 100);
  return {
    ...base,
    variancePct,
    result: within ? "pass" : "fail",
    reason: within
      ? `${compared}: ${off} apart, within the ${formatPrice(toleranceAbs)} rounding tolerance.`
      : `${compared}: ${off} ${diffCents > 0 ? "over" : "under"}${variancePct === null ? "" : ` (${formatPct(variancePct)})`}, beyond the ${formatPrice(toleranceAbs)} rounding tolerance.`,
  };
}

const unusable = (rule: string, label: string, stated: SourcedValue, options: TotalsOptions): TraceEntry => ({
  rule,
  ruleVersion: TOTALS_RULE_VERSION,
  expected: { value: Number.NaN, source: "could not calculate", confidence: 0 },
  actual: stated,
  variancePct: null,
  tolerancePct: null,
  toleranceAbs: options.toleranceAbs ?? 0.01,
  minConfidence: options.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
  result: "needs_review",
  reason: `The ${label} could not be checked because a value is missing or unreadable. A person needs to check the documents.`,
});

/** The invoice's own arithmetic: quantity x unit price should equal the line total. */
export function checkLineTotal(
  quantity: SourcedValue,
  unitPrice: SourcedValue,
  stated: SourcedValue,
  options: TotalsOptions = {},
): TraceEntry {
  if (![quantity, unitPrice, stated].every(isUsableNumber)) {
    return unusable(LINE_TOTAL_RULE, "line total", stated, options);
  }
  const calculated: SourcedValue = {
    value: toCents(quantity.value * unitPrice.value) / 100,
    source: `${quantity.value} × ${formatPrice(unitPrice.value)} from ${quantity.source}`,
    confidence: weakest([quantity, unitPrice]),
  };
  return compareTotal(LINE_TOTAL_RULE, "line total", [quantity, unitPrice], calculated, stated, options);
}

/** Line totals plus any charges (tax, shipping) should equal the invoice total. */
export function checkInvoiceTotal(
  lineTotals: SourcedValue[],
  charges: SourcedValue[],
  stated: SourcedValue,
  options: TotalsOptions = {},
): TraceEntry {
  const inputs = [...lineTotals, ...charges];
  if (lineTotals.length === 0 || ![...inputs, stated].every(isUsableNumber)) {
    return unusable(INVOICE_TOTAL_RULE, "invoice total", stated, options);
  }
  const cents = inputs.reduce((sum, v) => sum + toCents(v.value), 0);
  const parts = [`${lineTotals.length} line total${lineTotals.length === 1 ? "" : "s"}`, ...charges.map((c) => c.source)];
  const calculated: SourcedValue = {
    value: cents / 100,
    source: `sum of ${parts.join(" + ")}`,
    confidence: weakest(inputs),
  };
  return compareTotal(INVOICE_TOTAL_RULE, "invoice total", inputs, calculated, stated, options);
}
