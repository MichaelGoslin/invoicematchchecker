import { describe, expect, it } from "vitest";
import { decideSet, REQUIRED_RULES } from "./decision";
import { checkPoExists, checkReceivingExists } from "./documents";
import type { CheckResult, TraceEntry } from "./types";

const t = (rule: string, result: CheckResult): TraceEntry => ({
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
  reason: `${rule} ${result}`,
});
const allPass = () => REQUIRED_RULES.map((r) => t(r, "pass"));

describe("document checks", () => {
  it("passes and names the document when it is on file", () => {
    expect(checkPoExists("PO-1042")).toMatchObject({ result: "pass", reason: "Purchase order PO-1042 is on file." });
    expect(checkReceivingExists("RR-551").result).toBe("pass");
  });

  it("fails and says why when a document is missing", () => {
    expect(checkPoExists(null).reason).toContain("nothing shows the purchase was authorized");
    expect(checkReceivingExists(null).reason).toContain("nothing shows the goods arrived");
  });
});

describe("decisions for missing documents", () => {
  it("recommends rejection when there is no PO", () => {
    const traces = [t("po_exists", "fail"), t("not_a_duplicate", "pass"), t("invoice_total_equals_sum", "pass")];
    expect(decideSet("S-1", traces)).toMatchObject({ recommendation: "reject", reason: "reject" });
  });

  it("marks a set incomplete, not approved, when only the receiving report is missing", () => {
    const d = decideSet("S-2", [...allPass(), checkReceivingExists(null)]);
    expect(d).toMatchObject({ recommendation: "review", reason: "incomplete" });
    expect(d.summary).toContain("nothing shows the goods arrived");
  });

  it("treats a missing receiving report plus a failed check as an exception", () => {
    const traces = [...allPass().map((x) => (x.rule === "unit_price_within_tolerance" ? t(x.rule, "fail") : x)), checkReceivingExists(null)];
    const d = decideSet("S-3", traces);
    expect(d).toMatchObject({ recommendation: "review", reason: "exception" });
    expect(d.drivers.map((x) => x.rule)).toEqual(["unit_price_within_tolerance", "receiving_exists"]);
    expect(d.summary).toBe("Needs review: 2 checks failed.");
  });
});
