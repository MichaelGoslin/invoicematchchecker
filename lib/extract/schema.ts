/**
 * What Claude returns for one document. Every field carries the value, how sure
 * the read was, the exact text it came from and the page, so the decision trace
 * can show where each number came from.
 */
import { z } from "zod";

const confidence = z
  .number()
  .describe(
    "How sure you are that value is exactly what the document says, from 0 to 1. Use 1 only when the text is printed clearly and unambiguously. Lower it for smudged, handwritten, cut-off, overlapping or ambiguous text. Use 0 when value is null.",
  );

const evidence = z
  .string()
  .nullable()
  .describe("The exact characters on the page that value was read from, copied as printed. Null when value is null.");

const page = z.number().int().nullable().describe("1-based page number the value appears on. Null when value is null.");

export const TextFieldSchema = z.object({
  value: z.string().nullable().describe("The value as printed, or null if it is not on the document or cannot be read."),
  confidence,
  evidence,
  page,
});

export const NumberFieldSchema = z.object({
  value: z
    .number()
    .nullable()
    .describe("The number as printed, without currency symbols or thousands separators, or null if it is not on the document or cannot be read. Never calculate or infer a missing number."),
  confidence,
  evidence,
  page,
});

export const LineSchema = z.object({
  line_number: z.number().int().describe("The line or item number as printed; if lines are unnumbered, their 1-based order on the document."),
  item_code: TextFieldSchema.describe("SKU, part or item code for the line, if printed."),
  description: TextFieldSchema,
  quantity: NumberFieldSchema.describe("Quantity ordered (purchase order), received (receiving report) or billed (invoice)."),
  unit_price: NumberFieldSchema.describe("Price per unit. Null on a receiving report."),
  line_total: NumberFieldSchema.describe("Extended amount for the line as printed. Null on a receiving report."),
});

export const ExtractedDocumentSchema = z.object({
  document_type: z.enum(["purchase_order", "receiving_report", "invoice", "other"]),
  document_type_confidence: confidence,
  document_number: TextFieldSchema.describe("The document's own number: PO number, receiving report number or invoice number."),
  vendor: TextFieldSchema.describe("The supplier's name as printed, not the buyer's."),
  po_reference: TextFieldSchema.describe("The purchase order number this document refers to. On a purchase order, its own number."),
  document_date: TextFieldSchema.describe("The document date as printed."),
  lines: z.array(LineSchema),
  tax: NumberFieldSchema.describe("Total tax charged. Null if none is shown."),
  other_charges: NumberFieldSchema.describe("Shipping, freight or other charges added to the total, combined. Null if none."),
  total: NumberFieldSchema.describe("The final amount due or document total as printed."),
  reading_problems: z
    .array(z.string())
    .describe("Short notes on anything hard to read, missing or ambiguous. Empty if none."),
});

export type TextField = z.infer<typeof TextFieldSchema>;
export type NumberField = z.infer<typeof NumberFieldSchema>;
export type ExtractedLine = z.infer<typeof LineSchema>;
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
