/**
 * Whether the documents a match needs are on file. A missing document is a
 * finding in its own right, not a reason to quietly run a smaller match.
 */
import { DEFAULT_MIN_CONFIDENCE, normalizePoNumber } from "./shared";
import type { SourcedValue, TraceEntry } from "./types";

export const PO_EXISTS_RULE = "po_exists";
export const RECEIVING_EXISTS_RULE = "receiving_exists";
export const CITED_PO_RULE = "cited_po_on_file";
export const DOCUMENTS_RULE_VERSION = "2";

function presence(rule: string, label: string, onFile: string | null, missingReason: string): TraceEntry {
  return {
    rule,
    ruleVersion: DOCUMENTS_RULE_VERSION,
    scope: "header",
    lineIndex: null,
    expected: { value: `${label} on file`, source: "documents in this set", confidence: 1 },
    actual: onFile
      ? { value: onFile, source: "documents in this set", confidence: 1 }
      : { value: "none", source: "documents in this set", confidence: 1 },
    variancePct: null,
    tolerancePct: null,
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    result: onFile ? "pass" : "fail",
    reason: onFile ? `${label} ${onFile} is on file.` : missingReason,
  };
}

/** No PO means nothing authorized this purchase. Failing it recommends reject. */
export const checkPoExists = (poNumber: string | null) =>
  presence(PO_EXISTS_RULE, "Purchase order", poNumber, "No purchase order is on file for this invoice, so nothing shows the purchase was authorized.");

/**
 * Which PO check to run when a set may have no PO attached:
 * - a PO is attached: po_exists passes;
 * - the invoice cites no PO: po_exists fails (reject: nothing authorized it);
 * - the invoice's PO reference was read uncertainly: po_exists needs review (the PO may exist);
 * - the invoice clearly cites a PO that isn't on file: cited_po_on_file fails (incomplete: upload it or check).
 */
export function checkPoOnFile(poNumber: string | null, citedRef: SourcedValue<string> | null, minConfidence = DEFAULT_MIN_CONFIDENCE): TraceEntry {
  if (poNumber) return checkPoExists(poNumber);
  const cited = citedRef && normalizePoNumber(citedRef.value) ? citedRef : null;
  if (!cited) return checkPoExists(null);
  const base = presence(CITED_PO_RULE, "Purchase order", null, "");
  if (cited.confidence < minConfidence) {
    return {
      ...base,
      rule: PO_EXISTS_RULE,
      actual: { value: "not found", source: cited.source, confidence: cited.confidence },
      result: "needs_review",
      reason: `No PO was found for this invoice, but its PO reference "${cited.value}" (${cited.source}) was read at confidence ${cited.confidence.toFixed(2)}, below the ${minConfidence.toFixed(2)} minimum. The PO may exist; a person must check.`,
    };
  }
  return {
    ...base,
    expected: { value: cited.value, source: cited.source, confidence: cited.confidence },
    reason: `The invoice cites ${cited.value} (${cited.source}), but that purchase order is not on file. Upload it, or check the reference.`,
  };
}

/** A 3-way match needs proof of delivery. Failing it alone makes the set incomplete. */
export const checkReceivingExists = (rrNumber: string | null) =>
  presence(
    RECEIVING_EXISTS_RULE,
    "Receiving report",
    rrNumber,
    "No receiving report is on file, so nothing shows the goods arrived. A 3-way match can't be completed.",
  );
