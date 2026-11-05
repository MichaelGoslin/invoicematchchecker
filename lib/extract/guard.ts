/**
 * Code-side checks on Claude's self-reported confidence. Claude's number is a
 * starting point, not proof: these checks can only lower it, never raise it.
 */
import type { ExtractedDocument, NumberField, TextField } from "./schema";

/** Below the engine's 0.9 floor, so a field that fails a check always goes to a person. */
export const CAPPED_CONFIDENCE = 0.5;

const clamp = (c: number) => (Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0);

/** Every number written in a piece of text: "$1,234.50 x 12" gives [1234.5, 12]. */
const numbersIn = (s: string) =>
  (s.match(/-?\d[\d,]*(?:\.\d+)?|-?\.\d+/g) ?? []).map((m) => Number(m.replace(/,/g, "")));

const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function guardNumber(f: NumberField, label: string, notes: string[]): NumberField {
  if (f.value === null || !Number.isFinite(f.value)) return { ...f, value: null, confidence: 0 };
  const confidence = clamp(f.confidence);
  // The value must appear in the text it claims to come from.
  if (!f.evidence || !numbersIn(f.evidence).some((n) => Math.abs(n - f.value!) < 1e-9)) {
    notes.push(`${label}: value ${f.value} does not appear in its quoted text ${JSON.stringify(f.evidence)}; confidence capped.`);
    return { ...f, confidence: Math.min(confidence, CAPPED_CONFIDENCE) };
  }
  return { ...f, confidence };
}

function guardText(f: TextField, label: string, notes: string[]): TextField {
  if (f.value === null || alnum(f.value) === "") return { ...f, value: null, confidence: 0 };
  const confidence = clamp(f.confidence);
  if (!f.evidence || !alnum(f.evidence).includes(alnum(f.value))) {
    notes.push(`${label}: value ${JSON.stringify(f.value)} does not appear in its quoted text ${JSON.stringify(f.evidence)}; confidence capped.`);
    return { ...f, confidence: Math.min(confidence, CAPPED_CONFIDENCE) };
  }
  return { ...f, confidence };
}

/** Returns a copy with confidences checked, plus a note for every field that was capped. */
export function guardDocument(doc: ExtractedDocument): { document: ExtractedDocument; notes: string[] } {
  const notes: string[] = [];
  const document: ExtractedDocument = {
    ...doc,
    document_type_confidence: clamp(doc.document_type_confidence),
    document_number: guardText(doc.document_number, "document number", notes),
    vendor: guardText(doc.vendor, "vendor", notes),
    po_reference: guardText(doc.po_reference, "PO reference", notes),
    document_date: guardText(doc.document_date, "document date", notes),
    lines: doc.lines.map((l) => ({
      ...l,
      item_code: guardText(l.item_code, `line ${l.line_number} item code`, notes),
      description: guardText(l.description, `line ${l.line_number} description`, notes),
      quantity: guardNumber(l.quantity, `line ${l.line_number} quantity`, notes),
      unit_price: guardNumber(l.unit_price, `line ${l.line_number} unit price`, notes),
      line_total: guardNumber(l.line_total, `line ${l.line_number} line total`, notes),
    })),
    tax: guardNumber(doc.tax, "tax", notes),
    other_charges: guardNumber(doc.other_charges, "other charges", notes),
    total: guardNumber(doc.total, "total", notes),
  };
  return { document, notes };
}
