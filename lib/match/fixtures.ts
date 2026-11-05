/**
 * Synthetic unit-price cases shared by the tests, the demo script and the UI.
 * All values are made up. Joan: import `sampleUnitPriceTraces` to render real
 * TraceEntry objects in the review queue before the rest of the engine exists.
 */
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

/** Ready-made traces for UI work: one of each outcome. */
export const sampleUnitPriceTraces: TraceEntry[] = [
  unitPriceCases.exactMatch,
  unitPriceCases.overcharge,
  unitPriceCases.lowConfidence,
].map((c) => checkUnitPrice(c.po, c.invoice));
