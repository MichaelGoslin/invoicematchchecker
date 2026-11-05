/**
 * CSV for the ERP import. Values come from scanned documents, so they're
 * untrusted: a cell starting with =, +, -, @, tab or carriage return is
 * prefixed with ' so a spreadsheet shows it as text instead of running it.
 */
import type { ExportRow } from "../db/approvals";

export const EXPORT_COLUMNS = [
  "set_id",
  "vendor",
  "invoice_number",
  "invoice_date",
  "po_number",
  "invoice_total",
  "approved_by",
  "approved_at",
  "override",
  "override_reason",
] as const;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.setId,
        r.vendor,
        r.invoiceNumber,
        r.invoiceDate,
        r.poNumber,
        r.invoiceTotal,
        r.approvedBy,
        r.approvedAt.toISOString(),
        r.overridden ? "yes" : "no",
        r.overrideReason,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
