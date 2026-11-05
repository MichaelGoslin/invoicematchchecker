import { describe, expect, it } from "vitest";
import { checkInvoiceTotal, checkLineTotal, INVOICE_TOTAL_RULE } from "./totals";
import type { SourcedValue } from "./types";

const v = (value: number, source: string, confidence = 0.98): SourcedValue => ({ value, source, confidence });

describe("line total equals quantity × unit price", () => {
  it("approves a line whose arithmetic is right", () => {
    const t = checkLineTotal(v(3, "INV-889 line 2"), v(4.37, "INV-889 line 2"), v(13.11, "INV-889 line 2 total"));
    expect(t.result).toBe("pass");
    expect(t.expected.value).toBe(13.11);
  });

  it("allows a one-cent rounding difference", () => {
    // 3 × $4.335 = $13.005, which an invoice may print as $13.01 or $13.00.
    const qty = v(3, "INV-889 line 2");
    const price = v(4.335, "INV-889 line 2");
    expect(checkLineTotal(qty, price, v(13.01, "INV-889 line 2 total")).result).toBe("pass");
    expect(checkLineTotal(qty, price, v(13.0, "INV-889 line 2 total")).result).toBe("pass");
  });

  it("flags a line total that doesn't add up and shows the calculation", () => {
    const t = checkLineTotal(v(10, "INV-889 line 1"), v(2.5, "INV-889 line 1"), v(27.5, "INV-889 line 1 total"));
    expect(t.result).toBe("fail");
    for (const piece of ["$27.50", "$25.00", "10 × $2.50", "$2.50 over"]) {
      expect(t.reason).toContain(piece);
    }
  });

  it("sends an uncertain quantity read to a person", () => {
    const t = checkLineTotal(v(3, "INV-889 line 2", 0.55), v(4.37, "INV-889 line 2"), v(13.11, "INV-889 line 2 total"));
    expect(t.result).toBe("needs_review");
    expect(t.expected.confidence).toBe(0.55);
  });

  it("never passes when a value is missing", () => {
    const t = checkLineTotal(v(Number.NaN, "INV-889 line 2"), v(4.37, "INV-889 line 2"), v(13.11, "INV-889 line 2 total"));
    expect(t.result).toBe("needs_review");
  });
});

describe("invoice total equals line totals plus charges", () => {
  const lines = [v(25, "INV-889 line 1 total"), v(13.11, "INV-889 line 2 total"), v(40, "INV-889 line 3 total")];
  const tax = v(6.93, "INV-889 tax");

  it("approves an invoice whose lines and tax add up", () => {
    const t = checkInvoiceTotal(lines, [tax], v(85.04, "INV-889 total"));
    expect(t).toMatchObject({ rule: INVOICE_TOTAL_RULE, result: "pass", toleranceAbs: 0.01, tolerancePct: null });
    expect(t.expected.source).toBe("sum of 3 line totals + INV-889 tax");
  });

  it("flags an invoice total that is higher than its lines", () => {
    const t = checkInvoiceTotal(lines, [tax], v(95.04, "INV-889 total"));
    expect(t.result).toBe("fail");
    expect(t.reason).toContain("$10.00 over");
  });

  it("sends the set to a person when any line was read uncertainly", () => {
    const shaky = [...lines.slice(0, 2), v(40, "INV-889 line 3 total", 0.4)];
    const t = checkInvoiceTotal(shaky, [tax], v(85.04, "INV-889 total"));
    expect(t.result).toBe("needs_review");
    expect(t.reason).toContain("INV-889 line 3 total read at confidence 0.40");
  });

  it("never passes an invoice with no lines", () => {
    expect(checkInvoiceTotal([], [], v(0, "INV-889 total")).result).toBe("needs_review");
  });
});
