import {
  DEFAULT_MIN_CONFIDENCE,
  isUsableText,
  normalizeName,
  normalizePoNumber,
  uncertainReading,
} from "./shared";
import type { SourcedValue, TraceEntry } from "./types";

export const VENDOR_RULE = "vendor_matches_po";
export const PO_NUMBER_RULE = "po_number_matches";
export const IDENTITY_RULE_VERSION = "1";

export interface IdentityOptions {
  minConfidence?: number;
}

/** Text match after normalizing. Says when normalizing was needed, so the reviewer sees it. */
function checkText(
  rule: string,
  label: string,
  normalize: (s: string) => string,
  ignored: string,
  expected: SourcedValue<string>,
  actual: SourcedValue<string>,
  options: IdentityOptions,
): TraceEntry {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const base = {
    rule,
    ruleVersion: IDENTITY_RULE_VERSION,
    expected,
    actual,
    variancePct: null,
    tolerancePct: null,
    minConfidence,
  };

  if (!isUsableText(expected, normalize) || !isUsableText(actual, normalize)) {
    return {
      ...base,
      result: "needs_review",
      reason: `The ${label} is missing or unreadable on ${expected.source} or ${actual.source}. A person needs to check the documents.`,
    };
  }

  const uncertain = uncertainReading([expected, actual], minConfidence);
  if (uncertain) {
    return { ...base, result: "needs_review", reason: `${uncertain} A person must confirm the ${label} before it is trusted.` };
  }

  const pair = `"${actual.value}" (${actual.source}) vs "${expected.value}" (${expected.source})`;
  if (normalize(actual.value) === normalize(expected.value)) {
    const exact = actual.value === expected.value;
    return {
      ...base,
      result: "pass",
      reason: exact ? `The ${label} ${pair} match exactly.` : `The ${label} ${pair} match, ${ignored}.`,
    };
  }
  return { ...base, result: "fail", reason: `The ${label} does not match: ${pair}.` };
}

/** The invoice must come from the vendor on the PO. Only case, spacing and punctuation are ignored. */
export const checkVendor = (poVendor: SourcedValue<string>, invoiceVendor: SourcedValue<string>, options: IdentityOptions = {}) =>
  checkText(VENDOR_RULE, "vendor", normalizeName, "ignoring case, spacing and punctuation", poVendor, invoiceVendor, options);

/** The PO number the invoice cites must be the PO it is being matched to. */
export const checkPoNumber = (poNumber: SourcedValue<string>, invoicePoRef: SourcedValue<string>, options: IdentityOptions = {}) =>
  checkText(PO_NUMBER_RULE, "PO number", normalizePoNumber, 'ignoring case, spacing, dashes, a "PO" prefix and leading zeros', poNumber, invoicePoRef, options);
