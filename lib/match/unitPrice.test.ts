import { describe, expect, it } from "vitest";
import { unitPriceCases as cases } from "./fixtures";
import { checkUnitPrice, UNIT_PRICE_RULE } from "./unitPrice";

describe("unit price within tolerance", () => {
  it("approves a price that matches the PO exactly", () => {
    const t = checkUnitPrice(cases.exactMatch.po, cases.exactMatch.invoice);
    expect(t.result).toBe("pass");
    expect(t.variancePct).toBe(0);
  });

  it("allows a 2.0% price difference (within tolerance)", () => {
    const t = checkUnitPrice(cases.atTolerance.po, cases.atTolerance.invoice);
    expect(t.result).toBe("pass");
    expect(t.variancePct).toBe(2);
  });

  it("flags a price just over the 2.0% boundary", () => {
    const t = checkUnitPrice(cases.justOverTolerance.po, cases.justOverTolerance.invoice);
    expect(t.result).toBe("fail");
  });

  it("flags a 2.82% overcharge and shows the math and sources", () => {
    const t = checkUnitPrice(cases.overcharge.po, cases.overcharge.invoice);
    expect(t).toMatchObject({
      rule: UNIT_PRICE_RULE,
      ruleVersion: "2",
      result: "fail",
      variancePct: 2.82,
      tolerancePct: 2,
      expected: { value: 4.25, source: "PO-1042 line 2" },
      actual: { value: 4.37, source: "INV-889 line 2", confidence: 0.97 },
    });
    // The reason must carry the same numbers and sources as the trace.
    for (const piece of ["$4.37", "$4.25", "+2.82%", "2% tolerance", "PO-1042 line 2", "INV-889 line 2"]) {
      expect(t.reason).toContain(piece);
    }
  });

  it("flags an undercharge beyond tolerance", () => {
    const t = checkUnitPrice(cases.undercharge.po, cases.undercharge.invoice);
    expect(t.result).toBe("fail");
    expect(t.variancePct).toBe(-3.53);
    expect(t.reason).toContain("under");
  });

  it("sends a low-confidence reading to a person instead of deciding", () => {
    // The numbers match exactly, but the read is uncertain: it must not pass.
    const t = checkUnitPrice(cases.lowConfidence.po, cases.lowConfidence.invoice);
    expect(t.result).toBe("needs_review");
    expect(t.reason).toContain("INV-889 line 2 read at confidence 0.62");
  });

  it("sends a low-confidence PO reading to a person too", () => {
    const t = checkUnitPrice({ ...cases.overcharge.po, confidence: 0.5 }, cases.overcharge.invoice);
    expect(t.result).toBe("needs_review");
  });

  it("never passes when a price is missing or unreadable", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const t = checkUnitPrice(cases.exactMatch.po, { ...cases.exactMatch.invoice, value: bad });
      expect(t.result).toBe("needs_review");
      expect(t.variancePct).toBeNull();
    }
    const zeroPo = checkUnitPrice({ ...cases.exactMatch.po, value: 0 }, cases.exactMatch.invoice);
    expect(zeroPo.result).toBe("needs_review");
  });

  it("uses the tolerance it is given", () => {
    const t = checkUnitPrice(cases.overcharge.po, cases.overcharge.invoice, { tolerancePct: 3 });
    expect(t.result).toBe("pass");
    expect(t.tolerancePct).toBe(3);
  });
});

describe("unit price extended-cost cap ($50)", () => {
  // Boundary cases from Joan's review: 500 units at a $50.00 PO price.
  const po = { value: 50, source: "PO-1090 line 1", confidence: 1 };
  const price = (value: number) => ({ value, source: "NWF-5512 line 1 price", confidence: 0.98 });
  const qty = (value: number, confidence = 0.98) => ({ value, source: "NWF-5512 line 1 qty", confidence });

  it("passes $50.10 × 500 units: exactly $50.00 extra, at the cap", () => {
    const t = checkUnitPrice(po, price(50.1), { quantity: qty(500) });
    expect(t).toMatchObject({ result: "pass", extendedDiff: 50, extendedCap: 50 });
    expect(t.reason).toContain("× 500 units = $50.00 over, within the $50.00 cap");
  });

  it("flags $50.11 × 500 units: $55.00 extra, over the cap though only 0.22% over", () => {
    const t = checkUnitPrice(po, price(50.11), { quantity: qty(500) });
    expect(t).toMatchObject({ result: "fail", variancePct: 0.22, extendedDiff: 55 });
    expect(t.reason).toContain("within the 2% tolerance, but × 500 units = $55.00 over, beyond the $50.00 cap");
  });

  it("applies the cap to undercharges too", () => {
    expect(checkUnitPrice(po, price(49.89), { quantity: qty(500) }).result).toBe("fail");
  });

  it("sends an uncertain quantity read to a person, since it drives the cap", () => {
    expect(checkUnitPrice(po, price(50.1), { quantity: qty(500, 0.5) }).result).toBe("needs_review");
  });

  it("records the line it belongs to", () => {
    const t = checkUnitPrice(po, price(50), { quantity: qty(500), lineIndex: 0 });
    expect(t).toMatchObject({ scope: "line", lineIndex: 0 });
  });
});
