import { describe, expect, it } from "vitest";
import { checkVendor } from "../match/identity";
import { checkQuantityOrdered, checkQuantityReceived } from "../match/quantity";
import { checkLineTotal } from "../match/totals";
import type { SourcedValue, TraceEntry } from "../match/types";
import { checkUnitPrice } from "../match/unitPrice";
import { limitStatuses } from "./limits";

// Every case runs the real rule, so the marking is checked against what the engine decided.
const v = (value: number, source = "doc", confidence = 1): SourcedValue => ({ value, source, confidence });
const price = (po: number, inv: number, qty?: number, confidence = 1) =>
  checkUnitPrice(v(po, "PO line 1"), v(inv, "INV line 1", confidence), qty === undefined ? {} : { quantity: v(qty, "INV line 1") });
const statuses = (t: TraceEntry) => limitStatuses(t).map((l) => l.status);

describe("limitStatuses: unit price", () => {
  it("marks only the cap when the percent passes but the dollars don't (1,000 units, 1.9%, $1,900)", () => {
    const t = price(100, 101.9, 1000);
    expect(t.result).toBe("fail");
    expect(limitStatuses(t)).toEqual([
      { label: "±2%", status: "within", detail: "" },
      { label: "$50.00 extended cap", status: "over", detail: "over by $1,850.00" },
    ]);
  });

  it("marks only the percent when the dollars are small (+5.05%, $1.92)", () => {
    const t = price(1.9, 1.996, 20);
    expect(t.result).toBe("fail");
    expect(limitStatuses(t)).toEqual([
      { label: "±2%", status: "over", detail: "over by 3.05 points" },
      { label: "$50.00 extended cap", status: "within", detail: "" },
    ]);
  });

  it("marks both when both are broken", () => {
    expect(statuses(price(100, 107.5, 100))).toEqual(["over", "over"]);
  });

  it("treats a difference exactly on a limit as within, matching the engine", () => {
    const t = price(100, 102, 25);
    expect(t.result).toBe("pass");
    expect(statuses(t)).toEqual(["within", "within"]);
  });

  it("uses the size of the difference whichever direction it goes", () => {
    expect(limitStatuses(price(10, 9.647))[0]).toEqual({ label: "±2%", status: "over", detail: "over by 1.53 points" });
  });

  it("agrees with the engine when rounding hides the excess (2.004% shows as 2.00%)", () => {
    const t = price(100, 102.004);
    expect(t.result).toBe("fail");
    expect(t.variancePct).toBe(2);
    expect(limitStatuses(t)).toEqual([{ label: "±2%", status: "over", detail: "just over" }]);
  });

  it("marks nothing on an uncertain read: the values aren't trusted", () => {
    const t = price(101, 181, 10, 0.6);
    expect(t.result).toBe("needs_review");
    expect(statuses(t)).toEqual(["info", "info"]);
  });

  it("marks nothing on a trace stored before the rule recorded exceeded limits", () => {
    const { exceeded: _, ...old } = price(100, 110);
    expect(statuses(old)).toEqual(["info"]);
  });
});

describe("limitStatuses: quantity", () => {
  it("does not mark a partial invoice (billed less than received) as over", () => {
    const t = checkQuantityReceived(v(100), v(50));
    expect(t.result).toBe("pass");
    expect(limitStatuses(t)).toEqual([{ label: "up to +0%", status: "within", detail: "" }]);
  });

  it("marks billing more than was ordered", () => {
    const t = checkQuantityOrdered(v(100), v(110));
    expect(t.result).toBe("fail");
    expect(limitStatuses(t)).toEqual([{ label: "up to +0%", status: "over", detail: "over by 10.00 points" }]);
  });
});

describe("limitStatuses: other checks", () => {
  it("marks a line total past the rounding tolerance", () => {
    const t = checkLineTotal(v(10), v(4.25), v(42.75));
    expect(t.result).toBe("fail");
    expect(limitStatuses(t)).toEqual([{ label: "±$0.01", status: "over", detail: "over by $0.24" }]);
  });

  it("shows a line total within rounding as within", () => {
    expect(statuses(checkLineTotal(v(3), v(3.335), v(10.01)))).toEqual(["within"]);
  });

  it("falls back to the plain description for text checks", () => {
    const t = checkVendor({ value: "Acme", source: "PO", confidence: 1 }, { value: "Acme", source: "INV", confidence: 1 });
    expect(limitStatuses(t)).toEqual([{ label: "exact", status: "info", detail: "" }]);
  });
});
