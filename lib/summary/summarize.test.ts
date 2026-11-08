import { describe, expect, it } from "vitest";
import { NO_REASON, NOTE_ONLY, reasonLabel, summarize, type SummarySet } from "./summarize";

const set = (over: Partial<SummarySet> = {}): SummarySet => ({
  status: "pending",
  recommendation: "approve",
  decidedBy: null,
  overridden: false,
  overrideReason: null,
  exported: false,
  invoiceTotal: 100,
  cameIn: true,
  decidedToday: false,
  exportedToday: false,
  ...over,
});
const decided = (over: Partial<SummarySet>) => set({ status: "approved", decidedBy: "Joan", decidedToday: true, ...over });

describe("summarize", () => {
  it("handles an empty day", () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(s.overrideRate).toBeNull();
    expect(s.overrideReasons).toEqual([]);
    expect(s.byPerson).toEqual([]);
  });

  it("counts what came in, what was decided and what is still open", () => {
    const s = summarize([
      set(),
      set({ recommendation: "review" }),
      decided({ recommendation: "reject", status: "rejected" }),
      decided({ exported: true, exportedToday: true }),
      decided({ decidedBy: "Michael" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.recommended).toEqual({ approve: 3, review: 1, reject: 1 });
    expect([s.pending, s.approved, s.rejected]).toEqual([2, 2, 1]);
    expect([s.exported, s.readyToExport]).toEqual([1, 1]);
    expect(s.overrideRate).toBe(0);
  });

  it("keeps earlier days out of today's numbers but counts their open work", () => {
    const s = summarize([
      // Came in and was approved yesterday, exported today.
      set({ status: "approved", cameIn: false, exported: true, exportedToday: true, invoiceTotal: 999 }),
      // Came in yesterday, decided today.
      decided({ cameIn: false, invoiceTotal: 50 }),
      // Came in yesterday, still waiting.
      set({ cameIn: false, invoiceTotal: 20 }),
      // Approved yesterday, not yet exported.
      set({ status: "approved", cameIn: false, decidedBy: "Joan", invoiceTotal: 999 }),
    ]);
    expect(s.total).toBe(0);
    expect([s.approved, s.rejected, s.pending]).toEqual([1, 0, 1]);
    expect([s.exported, s.readyToExport]).toEqual([1, 2]);
    expect(s.byPerson).toEqual([{ person: "Joan", approved: 1, rejected: 0 }]);
    expect(s.dollars).toEqual({ approved: 50, rejected: 0, pending: 20 });
  });

  it("separates decisions that followed the engine from overrides, and ranks the reasons by code", () => {
    const s = summarize([
      decided({}),
      decided({ recommendation: "review", overridden: true, overrideReason: "Price change agreed with the buyer: emailed 11/3 at 10:30" }),
      decided({ recommendation: "review", overridden: true, overrideReason: "Price change agreed with the buyer" }),
      decided({ status: "rejected", decidedBy: "Michael", overridden: true, overrideReason: "checked by phone" }),
      decided({ status: "rejected", decidedBy: "Michael", overridden: true, overrideReason: "called them: wrong PO" }),
    ]);
    expect(s.followed).toBe(1);
    expect(s.overridden).toBe(4);
    expect(s.overrideRate).toBe(0.8);
    expect(s.overrideReasons).toEqual([
      { reason: NOTE_ONLY, count: 2 },
      { reason: "Price change agreed with the buyer", count: 2 },
    ]);
  });

  it("adds dollars in cents so floats cannot drift, and counts unreadable totals separately", () => {
    const s = summarize([
      decided({ invoiceTotal: 0.1 }),
      decided({ invoiceTotal: 0.2 }),
      decided({ status: "rejected", invoiceTotal: 2300 }),
      set({ invoiceTotal: 41.5 }),
      set({ invoiceTotal: null }),
    ]);
    expect(s.dollars).toEqual({ approved: 0.3, rejected: 2300, pending: 41.5 });
    expect(s.totalUnreadable).toBe(1);
  });

  it("counts the day's decisions per person, most active first", () => {
    const s = summarize([
      decided({ decidedBy: "Michael" }),
      decided({}),
      decided({ status: "rejected" }),
      decided({ decidedBy: null }),
    ]);
    expect(s.byPerson).toEqual([
      { person: "Joan", approved: 1, rejected: 1 },
      { person: "Michael", approved: 1, rejected: 0 },
      { person: "Unknown", approved: 1, rejected: 0 },
    ]);
  });
});

describe("reasonLabel", () => {
  it("uses the reason code picked in the queue, whatever the note says", () => {
    expect(reasonLabel("Not a duplicate (checked history): same number, other vendor")).toBe("Not a duplicate (checked history)");
    expect(reasonLabel("Other (explain in the note): see email")).toBe("Other (explain in the note)");
  });
  it("groups free-text notes together instead of one row per wording", () => {
    expect(reasonLabel("checked by phone")).toBe(NOTE_ONLY);
    expect(reasonLabel("Called at 10:30, fine")).toBe(NOTE_ONLY);
  });
  it("handles blanks", () => {
    expect(reasonLabel(null)).toBe(NO_REASON);
    expect(reasonLabel("   ")).toBe(NO_REASON);
  });
});
