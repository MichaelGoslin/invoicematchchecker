/**
 * Runs every rule over one invoice set and returns the full trace, in review
 * order, plus the set decision. Inputs are plain SourcedValues, so this works
 * the same for fixtures, extracted documents or hand-entered data.
 */
import { decideSet, type SetDecision } from "./decision";
import { checkPoOnFile, checkReceivingExists } from "./documents";
import { checkDuplicate, type PriorInvoice } from "./duplicate";
import { checkPoNumber, checkVendor } from "./identity";
import { checkQuantityOrdered, checkQuantityReceived } from "./quantity";
import { checkInvoiceTotal, checkLineTotal } from "./totals";
import type { SourcedValue, TraceEntry } from "./types";
import { checkUnitPrice } from "./unitPrice";

export interface MatchLineInput {
  /** From the PO. Leave out only when there is no PO. */
  ordered?: SourcedValue;
  /** From the receiving report. Leave out only when there is no receiving report. */
  received?: SourcedValue;
  /** From the PO. Leave out only when there is no PO. */
  poPrice?: SourcedValue;
  /** From the invoice. */
  invoiced: SourcedValue;
  invoicePrice: SourcedValue;
  lineTotal: SourcedValue;
}

export interface MatchSetInput {
  setId: string;
  /** Null when no PO is on file: po_exists fails (reject) and the PO-based checks don't run. */
  purchaseOrder: { number: SourcedValue<string>; vendor: SourcedValue<string> } | null;
  /** Null when no receiving report is on file. */
  receivingReport: { number: SourcedValue<string> } | null;
  /**
   * "3-way" (the default) needs a receiving report; without one the set is incomplete.
   * "2-way" is only for purchases with nothing to receive, such as services, and must be chosen explicitly.
   */
  matchType?: "3-way" | "2-way";
  invoiceVendor: SourcedValue<string>;
  invoiceNumber: SourcedValue<string>;
  invoicePoRef: SourcedValue<string>;
  lines: MatchLineInput[];
  /** Tax, shipping and other charges on the invoice. */
  charges: SourcedValue[];
  invoiceTotal: SourcedValue;
  /** Null when the history of processed invoices is unavailable; the duplicate check then needs review. */
  priors: PriorInvoice[] | null;
}

/** A value the documents should have had but didn't: unreadable, so its check needs review. */
const missing = (source: string): SourcedValue => ({ value: Number.NaN, source, confidence: 0 });

export function runSetChecks(input: MatchSetInput): TraceEntry[] {
  const po = input.purchaseOrder;
  const rr = input.receivingReport;
  const threeWay = (input.matchType ?? "3-way") === "3-way";

  const header = [
    checkPoOnFile(po ? po.number.value || "(number unreadable)" : null, input.invoicePoRef),
    ...(po ? [checkVendor(po.vendor, input.invoiceVendor), checkPoNumber(po.number, input.invoicePoRef)] : []),
    checkDuplicate(input.invoiceVendor, input.invoiceNumber, input.priors),
    ...(threeWay ? [checkReceivingExists(rr ? rr.number.value || "(number unreadable)" : null)] : []),
  ];

  const lines = input.lines.flatMap((l, i) => {
    const at = { lineIndex: i };
    const n = i + 1;
    return [
      ...(po ? [checkQuantityOrdered(l.ordered ?? missing(`PO line ${n} not found`), l.invoiced, at)] : []),
      ...(rr ? [checkQuantityReceived(l.received ?? missing(`receiving report line ${n} not found`), l.invoiced, at)] : []),
      ...(po ? [checkUnitPrice(l.poPrice ?? missing(`PO line ${n} not found`), l.invoicePrice, { ...at, quantity: l.invoiced })] : []),
      checkLineTotal(l.invoiced, l.invoicePrice, l.lineTotal, at),
    ];
  });

  const totals = checkInvoiceTotal(
    input.lines.map((l) => l.lineTotal),
    input.charges,
    input.invoiceTotal,
  );
  return [...header, ...lines, totals];
}

export function runSet(input: MatchSetInput): { traces: TraceEntry[]; decision: SetDecision } {
  const traces = runSetChecks(input);
  return { traces, decision: decideSet(input.setId, traces) };
}
