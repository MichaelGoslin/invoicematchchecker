/**
 * Field-level scoring: every value Claude read, compared with what the sample
 * document actually prints (sample-data/output/field_truth.csv).
 *
 * The number that matters most is a confident misread: a wrong value read at
 * or above the confidence floor. Those are the only misreads that can get past
 * the gate. A wrong value below the floor was already sent to a person.
 */
import type { ExtractionResult } from "../extract/extract";
import type { ExtractedDocument, NumberField, TextField } from "../extract/schema";
import { DEFAULT_MIN_CONFIDENCE, normalizeName } from "../match/shared";

export type DocRole = "invoice" | "po" | "receiving";

export interface FieldTruthRow {
  setId: string;
  document: DocRole;
  field: string;
  /** 1-based line number for line fields; null for header fields. */
  line: number | null;
  correct: string;
}

export type FieldOutcome =
  /** Right value, read confidently. */
  | "correct"
  /** Right value, but below the floor, so a person was asked anyway. Costs review time, not money. */
  | "correct_unsure"
  /** Wrong value below the floor: the gate caught it. */
  | "caught"
  /** Wrong value at or above the floor: could get past the gate. The dangerous case. */
  | "confident_misread"
  /** Not read at all (null). Treated as unreadable, so the gate caught it. */
  | "missing"
  /** The extractor has no field for this (e.g. subtotal); not scored. */
  | "not_extracted";

export interface FieldScore extends FieldTruthRow {
  /** Whether a rule reads this field. Misreads here can change a decision. */
  decisionField: boolean;
  read: string | null;
  confidence: number | null;
  outcome: FieldOutcome;
}

type Getter = (doc: ExtractedDocument, line: number | null) => TextField | NumberField | undefined;
type Kind = "id" | "name" | "text" | "number" | "date";

const lineOf = (doc: ExtractedDocument, line: number | null) =>
  line === null ? undefined : doc.lines.find((l) => l.line_number === line);

const header = (pick: (d: ExtractedDocument) => TextField | NumberField): Getter => (d) => pick(d);
const onLine = (pick: (l: ExtractedDocument["lines"][number]) => TextField | NumberField): Getter => (d, n) => {
  const l = lineOf(d, n);
  return l ? pick(l) : undefined;
};

/** How each truth field maps onto the extractor's schema, how to compare it, and whether a rule reads it. */
const FIELDS: Record<DocRole, Record<string, { get: Getter; kind: Kind; decision: boolean } | null>> = {
  invoice: {
    invoice_number: { get: header((d) => d.document_number), kind: "id", decision: true },
    vendor: { get: header((d) => d.vendor), kind: "name", decision: true },
    invoice_date: { get: header((d) => d.document_date), kind: "date", decision: false },
    po_reference: { get: header((d) => d.po_reference), kind: "id", decision: true },
    sku: { get: onLine((l) => l.item_code), kind: "id", decision: false },
    description: { get: onLine((l) => l.description), kind: "text", decision: false },
    quantity: { get: onLine((l) => l.quantity), kind: "number", decision: true },
    unit_price: { get: onLine((l) => l.unit_price), kind: "number", decision: true },
    line_total: { get: onLine((l) => l.line_total), kind: "number", decision: true },
    subtotal: null,
    tax: { get: header((d) => d.tax), kind: "number", decision: true },
    freight: { get: header((d) => d.other_charges), kind: "number", decision: true },
    total: { get: header((d) => d.total), kind: "number", decision: true },
  },
  po: {
    po_number: { get: header((d) => d.document_number), kind: "id", decision: true },
    vendor: { get: header((d) => d.vendor), kind: "name", decision: true },
    po_date: { get: header((d) => d.document_date), kind: "date", decision: false },
    sku: { get: onLine((l) => l.item_code), kind: "id", decision: false },
    description: { get: onLine((l) => l.description), kind: "text", decision: false },
    quantity: { get: onLine((l) => l.quantity), kind: "number", decision: true },
    unit_price: { get: onLine((l) => l.unit_price), kind: "number", decision: true },
  },
  receiving: {
    report_number: { get: header((d) => d.document_number), kind: "id", decision: true },
    report_date: { get: header((d) => d.document_date), kind: "date", decision: false },
    po_number: { get: header((d) => d.po_reference), kind: "id", decision: true },
    sku: { get: onLine((l) => l.item_code), kind: "id", decision: false },
    quantity_received: { get: onLine((l) => l.quantity), kind: "number", decision: true },
  },
};

const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Dates as printed vary ("2026-10-29", "10/29/2026", "Oct 29, 2026"); compare the calendar day. */
function isoDay(s: string): string | null {
  const t = s.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return t;
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  const parsed = Date.parse(`${t} 12:00 UTC`);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

export function sameValue(kind: Kind, read: string | number, correct: string): boolean {
  if (kind === "number") return typeof read === "number" && Math.abs(read - Number(correct)) < 0.005;
  const r = String(read);
  switch (kind) {
    case "id":
      return alnum(r) === alnum(correct);
    case "name":
      // The engine compares vendors the same way: case, spacing and punctuation don't matter.
      return normalizeName(r) === normalizeName(correct);
    case "date":
      return isoDay(r) !== null && isoDay(r) === isoDay(correct);
    case "text":
      return words(r) === words(correct);
  }
}

/** Scores every truth row for one document against what was extracted from it. */
export function scoreFields(rows: FieldTruthRow[], extraction: ExtractionResult, minConfidence = DEFAULT_MIN_CONFIDENCE): FieldScore[] {
  return rows.map((row) => {
    const spec = FIELDS[row.document][row.field];
    if (!spec) return { ...row, decisionField: false, read: null, confidence: null, outcome: "not_extracted" as const };
    const f = spec.get(extraction.document, row.line);
    if (!f || f.value === null) {
      // Nothing printed (e.g. an invoice that cites no PO) and nothing read is a correct read.
      const outcome = row.correct.trim() === "" ? ("correct" as const) : ("missing" as const);
      return { ...row, decisionField: spec.decision, read: null, confidence: f?.confidence ?? 0, outcome };
    }
    const right = sameValue(spec.kind, f.value, row.correct);
    const sure = f.confidence >= minConfidence;
    const outcome: FieldOutcome = right ? (sure ? "correct" : "correct_unsure") : sure ? "confident_misread" : "caught";
    return { ...row, decisionField: spec.decision, read: String(f.value), confidence: f.confidence, outcome };
  });
}

export function parseFieldTruth(rows: Record<string, string>[]): FieldTruthRow[] {
  return rows.map((r) => ({
    setId: r.set_id!,
    document: r.document as DocRole,
    field: r.field!,
    line: r.line ? Number(r.line) : null,
    correct: r.correct_value ?? "",
  }));
}
