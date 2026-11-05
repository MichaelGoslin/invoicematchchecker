import { describe, expect, it } from "vitest";
import { checkQuantityOrdered, checkQuantityReceived, QTY_RECEIVED_RULE } from "./quantity";
import type { SourcedValue } from "./types";

const rr = (value: number, confidence = 1): SourcedValue => ({ value, source: "RR-551 line 2", confidence });
const po = (value: number): SourcedValue => ({ value, source: "PO-1042 line 2", confidence: 1 });
const inv = (value: number, confidence = 0.98): SourcedValue => ({ value, source: "INV-889 line 2", confidence });

describe("quantity not over received (3-way match)", () => {
  it("approves billing for exactly what was received", () => {
    expect(checkQuantityReceived(rr(10), inv(10)).result).toBe("pass");
  });

  it("allows a partial invoice for less than was received", () => {
    const t = checkQuantityReceived(rr(10), inv(8));
    expect(t.result).toBe("pass");
    expect(t.reason).toContain("partial invoice");
  });

  it("flags billing for more than was received and shows the math", () => {
    const t = checkQuantityReceived(rr(10), inv(12));
    expect(t).toMatchObject({ rule: QTY_RECEIVED_RULE, result: "fail", variancePct: 20, tolerancePct: 0 });
    for (const piece of ["Invoiced 12", "INV-889 line 2", "2 more than the 10 received", "RR-551 line 2", "+20.00%"]) {
      expect(t.reason).toContain(piece);
    }
  });

  it("flags billing when nothing was received", () => {
    const t = checkQuantityReceived(rr(0), inv(5));
    expect(t.result).toBe("fail");
    expect(t.variancePct).toBeNull();
  });

  it("sends an uncertain receiving-report read to a person", () => {
    const t = checkQuantityReceived(rr(10, 0.7), inv(10));
    expect(t.result).toBe("needs_review");
    expect(t.reason).toContain("RR-551 line 2 read at confidence 0.70");
  });

  it("never passes on an unreadable quantity", () => {
    expect(checkQuantityReceived(rr(10), inv(Number.NaN)).result).toBe("needs_review");
    expect(checkQuantityReceived(rr(-1), inv(1)).result).toBe("needs_review");
  });

  it("uses the tolerance it is given", () => {
    expect(checkQuantityReceived(rr(100), inv(102), { tolerancePct: 2 }).result).toBe("pass");
    expect(checkQuantityReceived(rr(100), inv(103), { tolerancePct: 2 }).result).toBe("fail");
  });
});

describe("quantity not over ordered", () => {
  it("flags billing for more than the PO ordered", () => {
    const t = checkQuantityOrdered(po(10), inv(11));
    expect(t.result).toBe("fail");
    expect(t.reason).toContain("10 ordered");
  });

  it("approves billing within the ordered quantity", () => {
    expect(checkQuantityOrdered(po(10), inv(10)).result).toBe("pass");
  });
});

describe("quantity reasons", () => {
  it('says "unreadable" instead of NaN', () => {
    const t = checkQuantityReceived(rr(6), inv(Number.NaN));
    expect(t.reason).toContain("invoiced unreadable");
    expect(t.reason).not.toContain("NaN");
  });
});
