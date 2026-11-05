/**
 * Builders for ExtractedDocument objects in tests: what Claude would return for
 * synthetic documents. All values are made up.
 */
import type { ExtractionResult } from "./extract";
import type { ExtractedDocument, ExtractedLine, NumberField, TextField } from "./schema";

export const t = (value: string | null, confidence = 0.98, evidence: string | null = value, page: number | null = 1): TextField => ({
  value,
  confidence: value === null ? 0 : confidence,
  evidence: value === null ? null : evidence,
  page: value === null ? null : page,
});

export const n = (value: number | null, confidence = 0.98, evidence: string | null = value === null ? null : String(value)): NumberField => ({
  value,
  confidence: value === null ? 0 : confidence,
  evidence,
  page: value === null ? null : 1,
});

export const line = (
  line_number: number,
  quantity: number,
  unit_price: number | null,
  line_total: number | null,
  confidence = 0.98,
): ExtractedLine => ({
  line_number,
  item_code: t(null),
  description: t(`Item ${line_number}`),
  quantity: n(quantity, confidence),
  unit_price: n(unit_price, confidence),
  line_total: n(line_total, confidence),
});

export const doc = (overrides: Partial<ExtractedDocument> & Pick<ExtractedDocument, "document_type">): ExtractedDocument => ({
  document_type_confidence: 0.99,
  document_number: t(null),
  vendor: t(null),
  po_reference: t(null),
  document_date: t("2026-11-04"),
  lines: [],
  tax: n(null),
  other_charges: n(null),
  total: n(null),
  reading_problems: [],
  ...overrides,
});

export const result = (name: string, document: ExtractedDocument): ExtractionResult => ({
  name,
  document,
  guardNotes: [],
  model: "claude-opus-5-5",
  promptVersion: "1",
  usage: { inputTokens: 0, outputTokens: 0 },
});

/** Set S-15 as Claude would read it: line 3 smudged, line 1 overbilled, line 2 price up 5%. */
export const s15 = {
  purchaseOrder: result(
    "po-1077.pdf",
    doc({
      document_type: "purchase_order",
      document_number: t("PO-1077"),
      vendor: t("Brightline Paper"),
      po_reference: t("PO-1077"),
      lines: [line(1, 12, 18, 216), line(2, 4, 9.5, 38), line(3, 6, 3, 18)],
      total: n(272),
    }),
  ),
  receivingReport: result(
    "rr-560.pdf",
    doc({
      document_type: "receiving_report",
      document_number: t("RR-560"),
      vendor: t("Brightline Paper"),
      po_reference: t("PO-1077"),
      lines: [line(1, 10, null, null), line(2, 4, null, null), line(3, 6, null, null)],
    }),
  ),
  invoice: result(
    "bp-2240.pdf",
    doc({
      document_type: "invoice",
      document_number: t("BP-2240"),
      vendor: t("Brightline Paper"),
      po_reference: t("PO-1077"),
      lines: [line(1, 12, 18, 216), line(2, 4, 9.98, 39.92), line(3, 6, 3, 18, 0.64)],
      tax: n(24.31),
      total: n(298.23),
    }),
  ),
};
