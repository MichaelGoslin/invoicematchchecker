/**
 * Scores the rules engine against Joan's answer key (sample-data/output) using
 * the printed values in each set's truth.json, with no extraction. Any
 * disagreement is a rules or answer-key question, not a reading problem.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PriorInvoice } from "./duplicate";
import { type MatchLineInput, type MatchSetInput, runSet } from "./runSet";
import type { SourcedValue } from "./types";

interface TruthLine { sku: string; quantity?: number; quantityReceived?: number; unitPrice?: string; lineTotal?: string }
export interface Truth {
  setId: string;
  invoice: { number: string; vendor: string; poReference: string; lines: TruthLine[]; tax: string; freight: string; total: string };
  po?: { number: string; vendor: string; lines: TruthLine[] };
  receiving?: { number: string; lines: TruthLine[] };
}

export interface KeyRow {
  set_id: string;
  expected_outcome: string;
  expected_reason: string;
  seeded_problem: string;
  expected_failed_rules: string;
  is_scan: string;
}

export interface SetScore {
  setId: string;
  seededProblem: string;
  isScan: boolean;
  agrees: boolean;
  engine: { outcome: string; reason: string; failedRules: string[] };
  key: { outcome: string; reason: string; failedRules: string[] };
}

/** Small CSV parser that handles quoted fields with commas and doubled quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ""])));
}

const num = (value: number | string | undefined, source: string): SourcedValue => ({
  value: value === undefined ? Number.NaN : Number(value),
  source,
  confidence: 1,
});
const text = (value: string, source: string): SourcedValue<string> => ({ value, source, confidence: 1 });

/** Builds the engine's input from printed values, matching lines by SKU as the generator does. */
export function truthToMatchInput(t: Truth, priors: PriorInvoice[]): MatchSetInput {
  const inv = t.invoice;
  const poBySku = t.po ? new Map(t.po.lines.map((l) => [l.sku, l])) : undefined;
  const rrBySku = t.receiving ? new Map(t.receiving.lines.map((l) => [l.sku, l])) : undefined;

  const lines: MatchLineInput[] = inv.lines.map((il, i) => {
    const n = i + 1;
    const pl = poBySku?.get(il.sku);
    const rl = rrBySku?.get(il.sku);
    return {
      ...(poBySku ? { ordered: num(pl?.quantity, `${t.po!.number} line ${n}`), poPrice: num(pl?.unitPrice, `${t.po!.number} line ${n}`) } : {}),
      ...(rrBySku ? { received: num(rl?.quantityReceived, `${t.receiving!.number} line ${n}`) } : {}),
      invoiced: num(il.quantity, `${inv.number} line ${n} qty`),
      invoicePrice: num(il.unitPrice, `${inv.number} line ${n} price`),
      lineTotal: num(il.lineTotal, `${inv.number} line ${n} total`),
    };
  });

  return {
    setId: t.setId,
    purchaseOrder: t.po ? { vendor: text(t.po.vendor, `${t.po.number} header`), number: text(t.po.number, `${t.po.number} header`) } : null,
    receivingReport: t.receiving ? { number: text(t.receiving.number, `${t.receiving.number} header`) } : null,
    invoiceVendor: text(inv.vendor, `${inv.number} header`),
    invoiceNumber: text(inv.number, `${inv.number} header`),
    invoicePoRef: text(inv.poReference, `${inv.number} PO reference`),
    lines,
    charges: [num(inv.tax, `${inv.number} tax`), num(inv.freight, `${inv.number} freight`)],
    invoiceTotal: num(inv.total, `${inv.number} total`),
    priors,
  };
}

export function scoreAnswerKey(root = "sample-data/output"): SetScore[] {
  const key = parseCsv(readFileSync(path.join(root, "answer_key.csv"), "utf8")) as unknown as KeyRow[];
  const priors = JSON.parse(readFileSync(path.join(root, "history.json"), "utf8")) as PriorInvoice[];

  return key.map((row) => {
    const truth = JSON.parse(readFileSync(path.join(root, "sets", row.set_id, "truth.json"), "utf8")) as Truth;
    const { traces, decision } = runSet(truthToMatchInput(truth, priors));
    const failedRules = [...new Set(traces.filter((x) => x.result !== "pass").map((x) => x.rule))].sort();
    const keyRules = row.expected_failed_rules.split(/[;|\s]+/).filter(Boolean).sort();
    return {
      setId: row.set_id,
      seededProblem: row.seeded_problem,
      isScan: row.is_scan === "yes",
      agrees:
        decision.recommendation === row.expected_outcome &&
        decision.reason === row.expected_reason &&
        failedRules.join(",") === keyRules.join(","),
      engine: { outcome: decision.recommendation, reason: decision.reason, failedRules },
      key: { outcome: row.expected_outcome, reason: row.expected_reason, failedRules: keyRules },
    };
  });
}
