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
