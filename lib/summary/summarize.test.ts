import { describe, expect, it } from "vitest";
import { reasonLabel, summarize, type SummarySet } from "./summarize";

const set = (over: Partial<SummarySet> = {}): SummarySet => ({
  status: "pending",
  decision: { recommendation: "approve" },
  decidedBy: null,
  overridden: false,
  overrideReason: null,
  exportedAt: null,
  invoiceTotal: 100,
  ...over,
});

describe("summarize", () => {
  it("handles an empty day", () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(s.overrideRate).toBeNull();
    expect(s.overrideReasons).toEqual([]);
    expect(s.byPerson).toEqual([]);
  });

  it("counts recommendations, statuses and exports", () => {
    const s = summarize([
      set(),
      set({ decision: { recommendation: "review" } }),
      set({ decision: { recommendation: "reject" }, status: "rejected", decidedBy: "Joan" }),
      set({ status: "approved", decidedBy: "Joan", exportedAt: new Date() }),
      set({ status: "approved", decidedBy: "Michael" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.recommended).toEqual({ approve: 3, review: 1, reject: 1 });
    expect([s.pending, s.approved, s.rejected]).toEqual([2, 2, 1]);
    expect([s.exported, s.readyToExport]).toEqual([1, 1]);
    expect(s.overrideRate).toBe(0);
  });

  it("separates decisions that followed the engine from overrides, and ranks the reasons", () => {
    const s = summarize([
      set({ status: "approved", decidedBy: "Joan" }),
      set({ status: "approved", decidedBy: "Joan", decision: { recommendation: "review" }, overridden: true, overrideReason: "Price change agreed with the buyer: emailed 11/3" }),
      set({ status: "approved", decidedBy: "Joan", decision: { recommendation: "review" }, overridden: true, overrideReason: "Price change agreed with the buyer" }),
      set({ status: "rejected", decidedBy: "Michael", overridden: true, overrideReason: "checked by phone" }),
    ]);
    expect(s.followed).toBe(1);
    expect(s.overridden).toBe(3);
    expect(s.overrideRate).toBe(0.75);
    expect(s.overrideReasons).toEqual([
      { reason: "Price change agreed with the buyer", count: 2 },
      { reason: "checked by phone", count: 1 },
    ]);
  });

  it("adds dollars in cents so floats cannot drift, and counts unreadable totals separately", () => {
    const s = summarize([
      set({ status: "approved", invoiceTotal: 0.1 }),
      set({ status: "approved", invoiceTotal: 0.2 }),
      set({ status: "rejected", invoiceTotal: 2300 }),
      set({ invoiceTotal: 41.5 }),
      set({ invoiceTotal: null }),
    ]);
    expect(s.dollars).toEqual({ approved: 0.3, rejected: 2300, pending: 41.5 });
    expect(s.totalUnreadable).toBe(1);
  });

  it("counts decisions per person, most active first", () => {
    const s = summarize([
      set({ status: "approved", decidedBy: "Michael" }),
      set({ status: "approved", decidedBy: "Joan" }),
      set({ status: "rejected", decidedBy: "Joan" }),
      set({ status: "approved", decidedBy: null }),
    ]);
    expect(s.byPerson).toEqual([
      { person: "Joan", approved: 1, rejected: 1 },
      { person: "Michael", approved: 1, rejected: 0 },
      { person: "Unknown", approved: 1, rejected: 0 },
    ]);
  });
});

describe("reasonLabel", () => {
  it("uses the text before the first colon", () => {
    expect(reasonLabel("Not a duplicate (checked history): same number, other vendor")).toBe("Not a duplicate (checked history)");
  });
  it("handles blanks and very long notes", () => {
    expect(reasonLabel(null)).toBe("No reason given");
    expect(reasonLabel("   ")).toBe("No reason given");
    expect(reasonLabel("x".repeat(200))).toBe("Other");
  });
});
