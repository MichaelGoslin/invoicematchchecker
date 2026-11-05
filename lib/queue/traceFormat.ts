/** Turns a TraceEntry into the plain-text cells of the side-by-side check table. */
import { INVOICE_TOTAL_RULE, LINE_TOTAL_RULE, PO_EXISTS_RULE, RECEIVING_EXISTS_RULE, UNIT_PRICE_RULE, formatPct } from "../match";
import type { TraceEntry } from "../match/types";

const MONEY_RULES = new Set<string>([UNIT_PRICE_RULE, LINE_TOTAL_RULE, INVOICE_TOTAL_RULE]);

const RULE_NAMES: Record<string, string> = {
  vendor_matches_po: "Vendor",
  po_number_matches: "PO number",
  not_a_duplicate: "Duplicate",
  quantity_not_over_ordered: "Quantity vs ordered",
  quantity_not_over_received: "Quantity vs received",
  unit_price_within_tolerance: "Unit price",
  line_total_equals_qty_times_price: "Line total",
  invoice_total_equals_sum: "Invoice total",
  [PO_EXISTS_RULE]: "PO on file",
  [RECEIVING_EXISTS_RULE]: "Receiving report",
};

export const ruleName = (rule: string) => RULE_NAMES[rule] ?? rule;

export const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export function formatValue(rule: string, value: number | string): string {
  if (typeof value === "string") return value.trim() === "" ? "(blank)" : value;
  if (!Number.isFinite(value)) return "unreadable";
  return MONEY_RULES.has(rule) ? money(value) : String(value);
}

/** Where the check applies: "Line 2", "Header" or "Totals". */
export function checkWhere(t: TraceEntry): string {
  if (t.scope === "line" && t.lineIndex !== null) return `Line ${t.lineIndex + 1}`;
  return t.scope === "totals" ? "Totals" : "Header";
}

export function describeVariance(t: TraceEntry): string {
  if (t.variancePct === null) return "—";
  const extended = t.extendedDiff !== undefined ? ` (${money(t.extendedDiff)} extended)` : "";
  return `${formatPct(t.variancePct)}${extended}`;
}

export function describeTolerance(t: TraceEntry): string {
  const parts: string[] = [];
  if (t.tolerancePct !== null) parts.push(`±${t.tolerancePct}%`);
  if (t.toleranceAbs !== undefined) parts.push(`±${money(t.toleranceAbs)}`);
  if (t.extendedCap !== undefined) parts.push(`${money(t.extendedCap)} extended cap`);
  return parts.length > 0 ? parts.join(" and ") : "exact";
}

export const resultLabel = { pass: "Passed", fail: "Flagged", needs_review: "Needs review" } as const;
