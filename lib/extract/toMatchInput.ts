/**
 * Turns extracted documents into the engine's MatchSetInput. Anything missing
 * or unmatched becomes an unreadable value (confidence 0), so the rule that
 * needs it returns needs_review instead of guessing.
 */
import type { PriorInvoice } from "../match/duplicate";
import type { MatchLineInput, MatchSetInput } from "../match/runSet";
import type { SourcedValue } from "../match/types";
import type { ExtractionResult } from "./extract";
import type { ExtractedDocument, ExtractedLine, NumberField, TextField } from "./schema";

export interface SetDocuments {
  purchaseOrder: ExtractionResult;
  /** Leave out for a 2-way match. */
  receivingReport?: ExtractionResult;
  invoice: ExtractionResult;
}

export class SetAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetAssemblyError";
  }
}

const label = (r: ExtractionResult) => r.document.document_number.value ?? r.name;
const onPage = (source: string, page: number | null) => (page ? `${source}, p.${page}` : source);

const num = (f: NumberField, source: string): SourcedValue => ({
  value: f.value ?? Number.NaN,
  source: onPage(source, f.page),
  confidence: f.value === null ? 0 : f.confidence,
});

const text = (f: TextField, source: string, typeConfidence = 1): SourcedValue<string> => ({
  value: f.value ?? "",
  source: onPage(source, f.page),
  // A document that might not be what it seems can't vouch for its own header.
  confidence: f.value === null ? 0 : Math.min(f.confidence, typeConfidence),
});

const missing = (source: string): SourcedValue => ({ value: Number.NaN, source, confidence: 0 });

function expectType(r: ExtractionResult | undefined, type: ExtractedDocument["document_type"], role: string) {
  if (r && r.document.document_type !== type) {
    throw new SetAssemblyError(`${r.name} was read as ${r.document.document_type}, but was uploaded as the ${role}.`);
  }
}

const byLineNumber = (lines: ExtractedLine[]) => new Map(lines.map((l) => [l.line_number, l]));

export function toMatchInput(setId: string, docs: SetDocuments, priors: PriorInvoice[] | null): MatchSetInput {
  expectType(docs.purchaseOrder, "purchase_order", "purchase order");
  expectType(docs.receivingReport, "receiving_report", "receiving report");
  expectType(docs.invoice, "invoice", "invoice");

  const po = docs.purchaseOrder.document;
  const rr = docs.receivingReport?.document;
  const inv = docs.invoice.document;
  const poLabel = label(docs.purchaseOrder);
  const rrLabel = docs.receivingReport ? label(docs.receivingReport) : "";
  const invLabel = label(docs.invoice);

  const poLines = byLineNumber(po.lines);
  const rrLines = rr ? byLineNumber(rr.lines) : undefined;

  const lines: MatchLineInput[] = inv.lines.map((il) => {
    const n = il.line_number;
    const pl = poLines.get(n);
    const rl = rrLines?.get(n);
    return {
      ordered: pl ? num(pl.quantity, `${poLabel} line ${n}`) : missing(`${poLabel} has no line ${n}`),
      ...(rrLines ? { received: rl ? num(rl.quantity, `${rrLabel} line ${n}`) : missing(`${rrLabel} has no line ${n}`) } : {}),
      poPrice: pl ? num(pl.unit_price, `${poLabel} line ${n}`) : missing(`${poLabel} has no line ${n}`),
      invoiced: num(il.quantity, `${invLabel} line ${n} qty`),
      invoicePrice: num(il.unit_price, `${invLabel} line ${n} price`),
      lineTotal: num(il.line_total, `${invLabel} line ${n} total`),
    };
  });

  // A charge counts only when the invoice shows one; an absent charge is not an unreadable one.
  const charges = [
    ...(inv.tax.value !== null || inv.tax.evidence ? [num(inv.tax, `${invLabel} tax`)] : []),
    ...(inv.other_charges.value !== null || inv.other_charges.evidence ? [num(inv.other_charges, `${invLabel} other charges`)] : []),
  ];

  return {
    setId,
    poVendor: text(po.vendor, `${poLabel} header`, docs.purchaseOrder.document.document_type_confidence),
    poNumber: text(po.document_number, `${poLabel} header`, docs.purchaseOrder.document.document_type_confidence),
    invoiceVendor: text(inv.vendor, `${invLabel} header`, docs.invoice.document.document_type_confidence),
    invoiceNumber: text(inv.document_number, `${invLabel} header`, docs.invoice.document.document_type_confidence),
    invoicePoRef: text(inv.po_reference, `${invLabel} PO reference`, docs.invoice.document.document_type_confidence),
    lines,
    charges,
    invoiceTotal: num(inv.total, `${invLabel} total`),
    priors,
  };
}
