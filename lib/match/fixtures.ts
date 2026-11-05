/**
 * Synthetic cases shared by the tests, the demo scripts and the UI. All values
 * are made up. Joan: import `sampleUnitPriceTraces` or `sampleSets` (traces plus a decision) to render
 * real TraceEntry objects in the review queue.
 */
import { decideSet, type Recommendation } from "./decision";
import type { PriorInvoice } from "./duplicate";
import { runSetChecks } from "./runSet";
import type { SourcedValue, TraceEntry } from "./types";
import { checkUnitPrice } from "./unitPrice";

export interface UnitPriceCase {
  name: string;
  po: SourcedValue;
  invoice: SourcedValue;
}

const po = (value: number, line = 2): SourcedValue => ({
  value,
  source: `PO-1042 line ${line}`,
  confidence: 1,
});

const inv = (value: number, confidence = 0.98, line = 2): SourcedValue => ({
  value,
  source: `INV-889 line ${line}`,
  confidence,
});

export const unitPriceCases = {
  exactMatch: { name: "Exact match", po: po(4.25), invoice: inv(4.25) },
  atTolerance: { name: "Exactly 2.0% over", po: po(4.25), invoice: inv(4.335) },
  justOverTolerance: { name: "Just over 2.0%", po: po(4.25), invoice: inv(4.3354) },
  overcharge: { name: "Overcharge 2.82%", po: po(4.25), invoice: inv(4.37, 0.97) },
  undercharge: { name: "Undercharge 3.53%", po: po(4.25), invoice: inv(4.1) },
  lowConfidence: { name: "Low-confidence read", po: po(4.25), invoice: inv(4.25, 0.62) },
} satisfies Record<string, UnitPriceCase>;

/** Ready-made unit-price traces for UI work: one of each outcome. */
export const sampleUnitPriceTraces: TraceEntry[] = [
  unitPriceCases.exactMatch,
  unitPriceCases.overcharge,
  unitPriceCases.lowConfidence,
].map((c) => checkUnitPrice(c.po, c.invoice));

// ---------------------------------------------------------------------------
// Whole invoice sets: one PO, one receiving report, one invoice.
// ---------------------------------------------------------------------------

interface Line {
  ordered: number;
  received: number;
  poPrice: number;
  invoiced: number;
  invoicePrice: number;
  /** As printed on the invoice. */
  lineTotal: number;
  /** Confidence for each invoice read on this line. */
  conf?: number;
}

interface InvoiceSet {
  id: string;
  poNumber: string;
  poVendor: string;
  invoiceNumber: string;
  invoiceVendor: string;
  invoicePoRef: string;
  receivingReport: string;
  lines: Line[];
  tax: number;
  /** As printed on the invoice. */
  total: number;
}

const priorInvoices: PriorInvoice[] = [
  { vendor: "Acme Supply Co.", invoiceNumber: "INV-0870", ref: "set S-09, approved 2026-11-02" },
  { vendor: "Brightline Paper", invoiceNumber: "BP-2231", ref: "set S-11, approved 2026-11-03" },
];

/** Runs every rule over one set and returns the full trace, in review order. */
export function traceSet(set: InvoiceSet, priors: PriorInvoice[] = priorInvoices): TraceEntry[] {
  const inv = set.invoiceNumber;
  const text = (value: string, source: string, confidence = 0.98): SourcedValue<string> => ({ value, source, confidence });
  const num = (value: number, source: string, confidence = 0.98): SourcedValue => ({ value, source, confidence });

  return runSetChecks({
    setId: set.id,
    poVendor: text(set.poVendor, `${set.poNumber} header`, 1),
    poNumber: text(set.poNumber, `${set.poNumber} header`, 1),
    invoiceVendor: text(set.invoiceVendor, `${inv} header`),
    invoiceNumber: text(inv, `${inv} header`),
    invoicePoRef: text(set.invoicePoRef, `${inv} PO reference`),
    lines: set.lines.map((l, i) => {
      const n = i + 1;
      const c = l.conf ?? 0.98;
      return {
        ordered: num(l.ordered, `${set.poNumber} line ${n}`, 1),
        received: num(l.received, `${set.receivingReport} line ${n}`, 1),
        poPrice: num(l.poPrice, `${set.poNumber} line ${n}`, 1),
        invoiced: num(l.invoiced, `${inv} line ${n} qty`, c),
        invoicePrice: num(l.invoicePrice, `${inv} line ${n} price`, c),
        lineTotal: num(l.lineTotal, `${inv} line ${n} total`, c),
      };
    }),
    charges: [num(set.tax, `${inv} tax`)],
    invoiceTotal: num(set.total, `${inv} total`),
    priors,
  });
}

const cleanSet: InvoiceSet = {
  id: "S-14",
  poNumber: "PO-1042",
  poVendor: "Acme Supply Co.",
  invoiceNumber: "INV-889",
  invoiceVendor: "ACME SUPPLY CO",
  invoicePoRef: "PO 1042",
  receivingReport: "RR-551",
  lines: [
    { ordered: 10, received: 10, poPrice: 2.5, invoiced: 10, invoicePrice: 2.5, lineTotal: 25 },
    { ordered: 3, received: 3, poPrice: 4.3, invoiced: 3, invoicePrice: 4.37, lineTotal: 13.11 },
  ],
  tax: 3.39,
  total: 41.5,
};

const flaggedSet: InvoiceSet = {
  id: "S-15",
  poNumber: "PO-1077",
  poVendor: "Brightline Paper",
  invoiceNumber: "BP-2240",
  invoiceVendor: "Brightline Paper",
  invoicePoRef: "PO-1077",
  receivingReport: "RR-560",
  lines: [
    // Billed 12 cases, but only 10 arrived.
    { ordered: 12, received: 10, poPrice: 18, invoiced: 12, invoicePrice: 18, lineTotal: 216 },
    // Price crept up 5%.
    { ordered: 4, received: 4, poPrice: 9.5, invoiced: 4, invoicePrice: 9.98, lineTotal: 39.92 },
    // Smudged scan: the reader wasn't sure of this line.
    { ordered: 6, received: 6, poPrice: 3, invoiced: 6, invoicePrice: 3, lineTotal: 18, conf: 0.64 },
  ],
  tax: 24.31,
  total: 298.23,
};

const duplicateSet: InvoiceSet = {
  id: "S-16",
  poNumber: "PO-1031",
  poVendor: "Acme Supply Co.",
  // Same bill as set S-09, resubmitted with a different zero format.
  invoiceNumber: "INV 0870",
  invoiceVendor: "Acme Supply Co.",
  invoicePoRef: "PO-1031",
  receivingReport: "RR-540",
  lines: [{ ordered: 20, received: 20, poPrice: 1.75, invoiced: 20, invoicePrice: 1.75, lineTotal: 35 }],
  tax: 3.11,
  total: 38.11,
};

const bigLineSet: InvoiceSet = {
  id: "S-17",
  poNumber: "PO-1090",
  poVendor: "Northwind Fasteners",
  invoiceNumber: "NWF-5512",
  invoiceVendor: "Northwind Fasteners",
  invoicePoRef: "PO-1090",
  receivingReport: "RR-571",
  lines: [
    // Only 0.22% over, inside 2%, but 500 units × $0.11 = $55.00 extra, over the $50 cap.
    { ordered: 500, received: 500, poPrice: 50, invoiced: 500, invoicePrice: 50.11, lineTotal: 25055 },
  ],
  tax: 2223.63,
  total: 27278.63,
};

/**
 * Complete sets for UI and demo work, each with its answer key: the rules
 * expected to flag or need review (every other check should pass), and the
 * set-level recommendation.
 */
export const sampleSets = [
  {
    set: cleanSet,
    label: "Clean set (line 2 price is 1.63% over, inside tolerance)",
    expectFail: [],
    expectReview: [],
    expectRecommendation: "approve",
  },
  {
    set: flaggedSet,
    label: "Planted faults: overbilled quantity, 5% price increase, uncertain line 3",
    expectFail: ["quantity_not_over_received", "unit_price_within_tolerance"],
    expectReview: [
      "quantity_not_over_ordered",
      "quantity_not_over_received",
      "unit_price_within_tolerance",
      "line_total_equals_qty_times_price",
      "invoice_total_equals_sum",
    ],
    expectRecommendation: "review",
  },
  {
    set: duplicateSet,
    label: "Planted fault: resubmitted invoice",
    expectFail: ["not_a_duplicate"],
    expectReview: [],
    expectRecommendation: "reject",
  },
  {
    set: bigLineSet,
    label: "Planted fault: 0.22% price increase on 500 units, over the $50 cap",
    expectFail: ["unit_price_within_tolerance"],
    expectReview: [],
    expectRecommendation: "review",
  },
].map(({ set, label, expectFail, expectReview, expectRecommendation }) => {
  const traces = traceSet(set);
  return {
    id: set.id,
    label,
    invoice: set.invoiceNumber,
    answerKey: { fail: expectFail, needs_review: expectReview, recommendation: expectRecommendation as Recommendation },
    traces,
    decision: decideSet(set.id, traces),
  };
});
