/**
 * Whether the documents a match needs are on file. A missing document is a
 * finding in its own right, not a reason to quietly run a smaller match.
 */
import { DEFAULT_MIN_CONFIDENCE } from "./shared";
import type { TraceEntry } from "./types";

export const PO_EXISTS_RULE = "po_exists";
export const RECEIVING_EXISTS_RULE = "receiving_exists";
export const DOCUMENTS_RULE_VERSION = "1";

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

/** A 3-way match needs proof of delivery. Failing it alone makes the set incomplete. */
export const checkReceivingExists = (rrNumber: string | null) =>
  presence(
    RECEIVING_EXISTS_RULE,
    "Receiving report",
    rrNumber,
    "No receiving report is on file, so nothing shows the goods arrived. A 3-way match can't be completed.",
  );
