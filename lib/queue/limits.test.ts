import { describe, expect, it } from "vitest";
import type { TraceEntry } from "../match/types";
import { limitStatuses } from "./limits";

const price = (over: Partial<TraceEntry>): TraceEntry => ({
  rule: "unit_price_within_tolerance",
  ruleVersion: "1",
  scope: "line",
  lineIndex: 0,
  expected: { value: 100, source: "PO line 1", confidence: 1 },
  actual: { value: 101.9, source: "INV line 1", confidence: 0.98 },
  variancePct: 1.9,
  tolerancePct: 2,
  extendedDiff: 1900,
  extendedCap: 50,
  minConfidence: 0.9,
  result: "fail",
  reason: "x",
  ...over,
});

describe("limitStatuses", () => {
  it("marks only the cap when the percent passes but the dollars don't (1,000 units, 1.9%, $1,900)", () => {
    expect(limitStatuses(price({}))).toEqual([
      { label: "±2%", status: "within", detail: "" },
      { label: "$50.00 extended cap", status: "over", detail: "over by $1,850.00" },
    ]);
  });

  it("marks only the percent when the dollars are small (+5.05%, $1.92)", () => {
    expect(limitStatuses(price({ variancePct: 5.05, extendedDiff: 1.92 }))).toEqual([
      { label: "±2%", status: "over", detail: "over by 3.05 points" },
      { label: "$50.00 extended cap", status: "within", detail: "" },
    ]);
  });

  it("marks both when both are broken", () => {
    const s = limitStatuses(price({ variancePct: 7.5, extendedDiff: 400 }));
    expect(s.map((x) => x.status)).toEqual(["over", "over"]);
  });

  it("treats a difference exactly on a limit as within (the rule is 'over', not 'at or over')", () => {
    const s = limitStatuses(price({ variancePct: 2, extendedDiff: 50, result: "pass" }));
    expect(s.map((x) => x.status)).toEqual(["within", "within"]);
  });

  it("uses the size of the difference whichever direction it goes", () => {
    expect(limitStatuses(price({ variancePct: -3.53, extendedDiff: 0.45 }))[0]).toEqual({ label: "±2%", status: "over", detail: "over by 1.53 points" });
  });

  it("returns info (no marking) when there is nothing to compare", () => {
    expect(limitStatuses(price({ variancePct: null, extendedDiff: undefined }))).toEqual([
      { label: "±2%", status: "info", detail: "" },
      { label: "$50.00 extended cap", status: "info", detail: "" },
    ]);
  });

  it("falls back to the plain description for other checks", () => {
    const vendor = price({ rule: "vendor_matches_po", variancePct: null, tolerancePct: null, extendedDiff: undefined, extendedCap: undefined });
    expect(limitStatuses(vendor)).toEqual([{ label: "exact", status: "info", detail: "" }]);
    const totals = price({ rule: "invoice_total_equals_sum", variancePct: 0, tolerancePct: null, toleranceAbs: 0.01, extendedDiff: undefined, extendedCap: undefined });
    expect(limitStatuses(totals)).toEqual([{ label: "±$0.01", status: "info", detail: "" }]);
  });
});
