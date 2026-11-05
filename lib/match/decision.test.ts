import { describe, expect, it } from "vitest";
import { compareForQueue, decideSet, REQUIRED_RULES, type SetDecision } from "./decision";
import type { CheckResult, TraceEntry } from "./types";

/** A minimal trace for decision tests: only rule and result matter here. */
const t = (rule: string, result: CheckResult, reason = `${rule} ${result}`): TraceEntry => ({
  rule,
  ruleVersion: "1",
  scope: "header",
  lineIndex: null,
  expected: { value: 1, source: "PO", confidence: 1 },
  actual: { value: 1, source: "INV", confidence: 1 },
  variancePct: null,
  tolerancePct: null,
  minConfidence: 0.9,
  result,
  reason,
});

const allPass = () => REQUIRED_RULES.map((r) => t(r, "pass"));
const withResult = (rule: string, result: CheckResult) =>
  allPass().map((x) => (x.rule === rule ? t(rule, result) : x));

describe("set-level decision", () => {
  it("recommends approval only when every required check ran and passed", () => {
    const d = decideSet("S-1", allPass());
    expect(d).toMatchObject({ recommendation: "approve", reason: "clean", gated: false, drivers: [] });
    expect(d.summary).toBe("Recommend approve: all 5 checks passed.");
  });

  it("recommends rejection for a duplicate and names it", () => {
    const d = decideSet("S-2", withResult("not_a_duplicate", "fail"));
    expect(d).toMatchObject({ recommendation: "reject", reason: "reject" });
    expect(d.drivers.map((x) => x.rule)).toEqual(["not_a_duplicate"]);
    expect(d.summary).toContain("not_a_duplicate fail");
  });

  it("recommends rejection for a vendor mismatch", () => {
    expect(decideSet("S-3", withResult("vendor_matches_po", "fail")).recommendation).toBe("reject");
  });

  it("sends a price exception to review, not rejection", () => {
    const d = decideSet("S-4", withResult("unit_price_within_tolerance", "fail"));
    expect(d).toMatchObject({ recommendation: "review", reason: "exception", gated: false });
  });

  it("never approves a gated set, even when everything else passed", () => {
    const d = decideSet("S-5", withResult("invoice_total_equals_sum", "needs_review"));
    expect(d).toMatchObject({ recommendation: "review", reason: "gated", gated: true });
  });

  it("does not recommend rejection on uncertain data: gating outranks a reject", () => {
    const traces = [...withResult("not_a_duplicate", "fail"), t("unit_price_within_tolerance", "needs_review")];
    const d = decideSet("S-6", traces);
    expect(d).toMatchObject({ recommendation: "review", reason: "gated" });
    expect(d.drivers.map((x) => x.result)).toEqual(["needs_review", "fail"]);
    expect(d.summary).toContain("1 other check failed");
  });

  it("does not approve when a required check never ran", () => {
    const d = decideSet("S-7", allPass().filter((x) => x.rule !== "not_a_duplicate"));
    expect(d).toMatchObject({ recommendation: "review", reason: "incomplete", missingRules: ["not_a_duplicate"] });
  });

  it("does not approve an empty set", () => {
    expect(decideSet("S-8", []).recommendation).toBe("review");
  });
});

describe("review queue order", () => {
  it("sorts rejects, then gated, then other Needs review, then approve", () => {
    const decisions: SetDecision[] = [
      decideSet("A-clean", allPass()),
      decideSet("B-incomplete", []),
      decideSet("C-exception", withResult("unit_price_within_tolerance", "fail")),
      decideSet("D-gated", withResult("invoice_total_equals_sum", "needs_review")),
      decideSet("E-reject", withResult("not_a_duplicate", "fail")),
    ];
    expect([...decisions].sort(compareForQueue).map((d) => d.setId)).toEqual([
      "E-reject",
      "D-gated",
      "C-exception",
      "B-incomplete",
      "A-clean",
    ]);
  });
});
