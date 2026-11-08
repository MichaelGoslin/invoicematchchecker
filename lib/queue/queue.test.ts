import { describe, expect, it } from "vitest";
import { sampleSets } from "../match/fixtures";
import type { TraceEntry } from "../match/types";
import { groupByReason } from "./groups";
import { isAgainstRecommendation, overrideReasonText } from "./overrideReasons";
import { checkWhere, describeTolerance, describeVariance, formatValue, money, ruleName } from "./traceFormat";

const trace = (over: Partial<TraceEntry>): TraceEntry => ({
  rule: "unit_price_within_tolerance",
  ruleVersion: "1",
  scope: "line",
  lineIndex: 1,
  expected: { value: 4.25, source: "PO line 2", confidence: 1 },
  actual: { value: 4.37, source: "INV line 2", confidence: 0.97 },
  variancePct: 2.82,
  tolerancePct: 2,
  minConfidence: 0.9,
  result: "fail",
  reason: "x",
  ...over,
});

describe("groupByReason", () => {
  it("returns only non-empty groups, in work order, and keeps every set", () => {
    const groups = groupByReason(sampleSets);
    const order = ["reject", "gated", "exception", "incomplete", "clean"];
    const idx = groups.map((g) => order.indexOf(g.reason));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(sampleSets.length);
  });

  it("puts every item in the group that matches its decision reason", () => {
    for (const g of groupByReason(sampleSets)) for (const i of g.items) expect(i.decision.reason).toBe(g.reason);
  });
});

describe("override reasons", () => {
  it("joins the code's label and the note", () => {
    expect(overrideReasonText("price_agreed", " buyer emailed 11/3 ")).toBe("Price change agreed with the buyer: buyer emailed 11/3");
  });
  it("works with only a code, only a note, or neither", () => {
    expect(overrideReasonText("vendor_variant", "")).toBe("Same vendor, name printed differently");
    expect(overrideReasonText("", "checked by phone")).toBe("checked by phone");
    expect(overrideReasonText("", "  ")).toBe("");
  });
  it("matches the server's definition of an override", () => {
    expect(isAgainstRecommendation("approve", "approve")).toBe(false);
    expect(isAgainstRecommendation("approve", "review")).toBe(true);
    expect(isAgainstRecommendation("approve", "reject")).toBe(true);
    expect(isAgainstRecommendation("reject", "approve")).toBe(true);
    expect(isAgainstRecommendation("reject", "review")).toBe(false);
    expect(isAgainstRecommendation("reject", "reject")).toBe(false);
  });
});

describe("trace formatting", () => {
  it("formats money, counts, text and unreadable values", () => {
    expect(formatValue("unit_price_within_tolerance", 4.335)).toBe("$4.335");
    expect(formatValue("invoice_total_equals_sum", 1234.5)).toBe("$1,234.50");
    expect(formatValue("quantity_not_over_ordered", 12)).toBe("12");
    expect(formatValue("vendor_matches_po", "")).toBe("(blank)");
    expect(formatValue("unit_price_within_tolerance", Number.NaN)).toBe("unreadable");
    expect(money(50)).toBe("$50.00");
  });
  it("describes where, variance and tolerance", () => {
    expect(checkWhere(trace({}))).toBe("Line 2");
    expect(checkWhere(trace({ scope: "header", lineIndex: null }))).toBe("Header");
    expect(checkWhere(trace({ scope: "totals", lineIndex: null }))).toBe("Totals");
    expect(describeVariance(trace({ extendedDiff: 0.36 }))).toBe("+2.82% ($0.36 extended)");
    expect(describeVariance(trace({ variancePct: null }))).toBe("—");
    expect(describeTolerance(trace({ extendedCap: 50 }))).toBe("±2% and $50.00 extended cap");
    expect(describeTolerance(trace({ tolerancePct: null, toleranceAbs: 0.01 }))).toBe("±$0.01");
    expect(describeTolerance(trace({ tolerancePct: null }))).toBe("exact");
  });
  it("uses plain names for rules and falls back to the rule id", () => {
    expect(ruleName("unit_price_within_tolerance")).toBe("Unit price");
    expect(ruleName("something_new")).toBe("something_new");
  });
});
