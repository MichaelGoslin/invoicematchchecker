import { describe, expect, it } from "vitest";
import { scoreAnswerKey } from "./answerKey";

const scores = scoreAnswerKey();

describe("rules engine against the sample-data answer key (printed values, no extraction)", () => {
  it("covers all 100 sets", () => {
    expect(scores).toHaveLength(100);
  });

  it("agrees with the key on every set except the scan", () => {
    // The scan (S-087) is only gated if extraction reads a field below the floor.
    // On printed values it is clean, which the sample-data README says is acceptable.
    const disagreements = scores.filter((s) => !s.agrees && !s.isScan);
    expect(disagreements).toEqual([]);
  });

  it("never recommends approval for a set the key does not approve", () => {
    const falseApprovals = scores.filter((s) => s.engine.outcome === "approve" && s.key.outcome !== "approve" && !s.isScan);
    expect(falseApprovals).toEqual([]);
  });

  it("recommends rejection for every set with no PO", () => {
    for (const s of scores.filter((x) => x.seededProblem === "missing_po")) {
      expect(s.engine).toMatchObject({ outcome: "reject", reason: "reject", failedRules: ["po_exists"] });
    }
  });

  it("does not approve a set with no receiving report", () => {
    for (const s of scores.filter((x) => x.seededProblem === "missing_receiving_report")) {
      expect(s.engine).toMatchObject({ outcome: "review", reason: "incomplete", failedRules: ["receiving_exists"] });
    }
  });
});
