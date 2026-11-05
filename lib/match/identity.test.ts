import { describe, expect, it } from "vitest";
import { checkPoNumber, checkVendor } from "./identity";
import type { SourcedValue } from "./types";

const s = (value: string, source: string, confidence = 0.98): SourcedValue<string> => ({ value, source, confidence });

describe("vendor matches the PO", () => {
  it("approves the same vendor", () => {
    expect(checkVendor(s("Acme Supply Co.", "PO-1042 header"), s("Acme Supply Co.", "INV-889 header")).result).toBe("pass");
  });

  it("ignores case and punctuation, and says so", () => {
    const t = checkVendor(s("Acme Supply Co.", "PO-1042 header"), s("ACME SUPPLY CO", "INV-889 header"));
    expect(t.result).toBe("pass");
    expect(t.reason).toContain("ignoring case, spacing and punctuation");
  });

  it("flags a different vendor and names both", () => {
    const t = checkVendor(s("Acme Supply Co.", "PO-1042 header"), s("Acme Supplies LLC", "INV-889 header"));
    expect(t.result).toBe("fail");
    expect(t.reason).toContain('"Acme Supplies LLC" (INV-889 header) vs "Acme Supply Co." (PO-1042 header)');
  });

  it("does not treat Inc and LLC as the same company", () => {
    expect(checkVendor(s("Acme Inc", "PO-1042 header"), s("Acme LLC", "INV-889 header")).result).toBe("fail");
  });

  it("sends an uncertain vendor read to a person", () => {
    expect(checkVendor(s("Acme Supply Co.", "PO-1042 header"), s("Acme Supply Co.", "INV-889 header", 0.6)).result).toBe("needs_review");
  });

  it("never passes a blank vendor", () => {
    expect(checkVendor(s("Acme Supply Co.", "PO-1042 header"), s("  ", "INV-889 header")).result).toBe("needs_review");
  });
});

describe("PO number matches", () => {
  it("treats PO-01042, po 1042 and 1042 as the same PO", () => {
    for (const ref of ["PO-01042", "po 1042", "1042"]) {
      expect(checkPoNumber(s("PO-1042", "PO-1042 header"), s(ref, "INV-889 PO reference")).result).toBe("pass");
    }
  });

  it("flags an invoice citing a different PO", () => {
    const t = checkPoNumber(s("PO-1042", "PO-1042 header"), s("PO-1024", "INV-889 PO reference"));
    expect(t.result).toBe("fail");
    expect(t.reason).toContain('"PO-1024"');
  });

  it("sends an uncertain PO reference read to a person", () => {
    expect(checkPoNumber(s("PO-1042", "PO-1042 header"), s("PO-1042", "INV-889 PO reference", 0.5)).result).toBe("needs_review");
  });
});
