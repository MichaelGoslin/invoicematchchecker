import {
  DEFAULT_MIN_CONFIDENCE,
  isUsableText,
  normalizeInvoiceNumber,
  normalizeName,
  uncertainReading,
  weakest,
} from "./shared";
import type { SourcedValue, TraceEntry } from "./types";

export const DUPLICATE_RULE = "not_a_duplicate";
export const DUPLICATE_RULE_VERSION = "1";

/** An invoice already processed, e.g. from the audit log. */
export interface PriorInvoice {
  vendor: string;
  invoiceNumber: string;
  /** Where to find it, e.g. "set S-12, approved 2026-11-03". */
  ref: string;
}

export interface DuplicateOptions {
  minConfidence?: number;
}

/**
 * Flags an invoice whose vendor and invoice number were already processed.
 * A misread invoice number could hide a duplicate, so low confidence goes to a person.
 */
export function checkDuplicate(
  vendor: SourcedValue<string>,
  invoiceNumber: SourcedValue<string>,
  priors: PriorInvoice[],
  options: DuplicateOptions = {},
): TraceEntry {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const expected: SourcedValue<string> = {
    value: `${invoiceNumber.value} from ${vendor.value}`,
    source: invoiceNumber.source,
    confidence: weakest([vendor, invoiceNumber]),
  };
  const searched = `${priors.length} processed invoice${priors.length === 1 ? "" : "s"}`;
  const base = {
    rule: DUPLICATE_RULE,
    ruleVersion: DUPLICATE_RULE_VERSION,
    expected,
    variancePct: null,
    tolerancePct: null,
    minConfidence,
  };
  const noMatch: SourcedValue<string> = { value: "no earlier match", source: searched, confidence: 1 };

  if (!isUsableText(vendor, normalizeName) || !isUsableText(invoiceNumber, normalizeInvoiceNumber)) {
    return {
      ...base,
      actual: noMatch,
      result: "needs_review",
      reason: "The vendor or invoice number is missing or unreadable, so duplicates could not be ruled out. A person needs to check.",
    };
  }

  const key = (v: string, n: string) => `${normalizeName(v)}|${normalizeInvoiceNumber(n)}`;
  const target = key(vendor.value, invoiceNumber.value);
  const match = priors.find((p) => key(p.vendor, p.invoiceNumber) === target);

  const uncertain = uncertainReading([vendor, invoiceNumber], minConfidence);
  if (uncertain) {
    return {
      ...base,
      actual: noMatch,
      result: "needs_review",
      reason: `${uncertain} A misread number could hide a duplicate, so a person must confirm it.`,
    };
  }

  if (match) {
    return {
      ...base,
      actual: { value: `${match.invoiceNumber} from ${match.vendor}`, source: match.ref, confidence: 1 },
      result: "fail",
      reason: `Possible duplicate: ${invoiceNumber.value} from ${vendor.value} was already processed (${match.ref}).`,
    };
  }
  return {
    ...base,
    actual: noMatch,
    result: "pass",
    reason: `No earlier invoice ${invoiceNumber.value} from ${vendor.value} among ${searched}.`,
  };
}
