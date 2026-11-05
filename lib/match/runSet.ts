/**
 * Runs every rule over one invoice set and returns the full trace, in review
 * order, plus the set decision. Inputs are plain SourcedValues, so this works
 * the same for fixtures, extracted documents or hand-entered data.
 */
import { decideSet, type SetDecision } from "./decision";
import { checkDuplicate, type PriorInvoice } from "./duplicate";
import { checkPoNumber, checkVendor } from "./identity";
import { checkQuantityOrdered, checkQuantityReceived } from "./quantity";
import { checkInvoiceTotal, checkLineTotal } from "./totals";
import type { SourcedValue, TraceEntry } from "./types";
import { checkUnitPrice } from "./unitPrice";

export interface MatchLineInput {
  /** From the PO. */
  ordered: SourcedValue;
  /** From the receiving report. Leave out for a 2-way match. */
  received?: SourcedValue;
  /** From the PO. */
  poPrice: SourcedValue;
  /** From the invoice. */
  invoiced: SourcedValue;
  invoicePrice: SourcedValue;
  lineTotal: SourcedValue;
}

export interface MatchSetInput {
  setId: string;
  poVendor: SourcedValue<string>;
  poNumber: SourcedValue<string>;
  invoiceVendor: SourcedValue<string>;
  invoiceNumber: SourcedValue<string>;
  invoicePoRef: SourcedValue<string>;
  lines: MatchLineInput[];
  /** Tax, shipping and other charges on the invoice. */
  charges: SourcedValue[];
  invoiceTotal: SourcedValue;
  priors: PriorInvoice[];
}

export function runSetChecks(input: MatchSetInput): TraceEntry[] {
  const header = [
    checkVendor(input.poVendor, input.invoiceVendor),
    checkPoNumber(input.poNumber, input.invoicePoRef),
    checkDuplicate(input.invoiceVendor, input.invoiceNumber, input.priors),
  ];

  const lines = input.lines.flatMap((l, i) => {
    const at = { lineIndex: i };
    return [
      checkQuantityOrdered(l.ordered, l.invoiced, at),
      ...(l.received ? [checkQuantityReceived(l.received, l.invoiced, at)] : []),
      checkUnitPrice(l.poPrice, l.invoicePrice, { ...at, quantity: l.invoiced }),
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
