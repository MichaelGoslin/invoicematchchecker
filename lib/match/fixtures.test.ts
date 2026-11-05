import { describe, expect, it } from "vitest";
import { sampleSets } from "./fixtures";

describe("sample sets against their answer key", () => {
  for (const s of sampleSets) {
    it(`${s.id}: flags exactly the planted faults (${s.label})`, () => {
      const rulesWith = (result: string) => s.traces.filter((t) => t.result === result).map((t) => t.rule);
      expect(rulesWith("fail")).toEqual(s.answerKey.fail);
      expect(rulesWith("needs_review")).toEqual(s.answerKey.needs_review);
    });
  }

  it("every trace carries its sources and a reason", () => {
    for (const t of sampleSets.flatMap((s) => s.traces)) {
      expect(t.expected.source).not.toBe("");
      expect(t.actual.source).not.toBe("");
      expect(t.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("sample sets: recommendation and trace location", () => {
  for (const s of sampleSets) {
    it(`${s.id}: recommends ${s.answerKey.recommendation}`, () => {
      expect(s.decision.recommendation).toBe(s.answerKey.recommendation);
    });
  }

  it("never recommends approval for a set with a planted fault", () => {
    for (const s of sampleSets.filter((x) => x.answerKey.fail.length + x.answerKey.needs_review.length > 0)) {
      expect(s.decision.recommendation).not.toBe("approve");
    }
  });

  it("tags every trace with its scope, and line checks with a line index", () => {
    for (const t of sampleSets.flatMap((s) => s.traces)) {
      if (t.scope === "line") expect(t.lineIndex).toEqual(expect.any(Number));
      else expect(t.lineIndex).toBeNull();
    }
  });
});
