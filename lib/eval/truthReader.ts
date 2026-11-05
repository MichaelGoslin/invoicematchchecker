/**
 * A fake extractor that reads each sample document perfectly, from its
 * truth.json. Used to test the evaluation itself at no cost, and to plant
 * misreads on purpose. Never used for a real score.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentInput, ExtractionResult } from "../extract/extract";
import type { ExtractedDocument } from "../extract/schema";
import { doc, n, result, t } from "../extract/testDocs";
import type { DocRole } from "./fields";
import type { Extractor } from "./run";

interface TruthLine { sku: string; description?: string; quantity?: number; quantityReceived?: number; unitPrice?: string; lineTotal?: string }
interface TruthDoc { number: string; vendor?: string; date?: string; poReference?: string; poNumber?: string; lines: TruthLine[]; tax?: string; freight?: string; total?: string }

/** Lets a test change what the reader returns for one document: plant a misread, lower a confidence. */
export type Tamper = (setId: string, role: DocRole, document: ExtractedDocument) => ExtractedDocument;

const roleOf = (name: string): { setId: string; role: DocRole } => {
  const m = name.match(/^(S-\d{3})-(po|receiving|invoice)\./);
  if (!m) throw new Error(`Can't tell which sample document ${name} is.`);
  return { setId: m[1]!, role: m[2] as DocRole };
};

function toDocument(role: DocRole, d: TruthDoc): ExtractedDocument {
  const lines = d.lines.map((l, i) => ({
    line_number: i + 1,
    item_code: t(l.sku),
    description: t(l.description ?? null),
    quantity: n(role === "receiving" ? (l.quantityReceived ?? null) : (l.quantity ?? null), 0.99),
    unit_price: n(l.unitPrice === undefined ? null : Number(l.unitPrice), 0.99),
    line_total: n(l.lineTotal === undefined ? null : Number(l.lineTotal), 0.99),
  }));
  const num = (v: string | undefined) => n(v === undefined ? null : Number(v), 0.99);
  return doc({
    document_type: role === "po" ? "purchase_order" : role === "receiving" ? "receiving_report" : "invoice",
    document_number: t(d.number),
    vendor: t(d.vendor ?? null),
    po_reference: t((role === "po" ? d.number : role === "receiving" ? d.poNumber : d.poReference) || null),
    document_date: t(d.date ?? null),
    lines,
    tax: num(d.tax),
    other_charges: num(d.freight),
    total: num(d.total),
  });
}

export function truthReader(root = "sample-data/output", tamper?: Tamper): Extractor {
  return async (input: DocumentInput): Promise<ExtractionResult> => {
    const { setId, role } = roleOf(input.name);
    const truth = JSON.parse(readFileSync(path.join(root, "sets", setId, "truth.json"), "utf8")) as Record<DocRole, TruthDoc>;
    const key = role === "po" ? "po" : role === "receiving" ? "receiving" : "invoice";
    const document = toDocument(role, truth[key]);
    return result(input.name, tamper ? tamper(setId, role, document) : document);
  };
}
