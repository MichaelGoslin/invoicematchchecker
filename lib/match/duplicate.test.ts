import { describe, expect, it } from "vitest";
import { checkDuplicate, type PriorInvoice } from "./duplicate";
import type { SourcedValue } from "./types";

const s = (value: string, source: string, confidence = 0.98): SourcedValue<string> => ({ value, source, confidence });
const vendor = s("Acme Supply Co.", "INV-889 header");
const priors: PriorInvoice[] = [
  { vendor: "Acme Supply Co.", invoiceNumber: "INV-0870", ref: "set S-09, approved 2026-11-02" },
  { vendor: "Brightline Paper", invoiceNumber: "INV-889", ref: "set S-11, approved 2026-11-03" },
];

describe("not a duplicate", () => {
  it("approves a new invoice and says how many were searched", () => {
    const t = checkDuplicate(vendor, s("INV-889", "INV-889 header"), priors);
    expect(t.result).toBe("pass");
    expect(t.reason).toContain("among 2 processed invoices");
  });

  it("flags an invoice number already processed for the same vendor and points to it", () => {
    const t = checkDuplicate(vendor, s("inv 0870", "INV-0870 header"), priors);
    expect(t.result).toBe("fail");
    expect(t.actual.source).toBe("set S-09, approved 2026-11-02");
    expect(t.reason).toContain("Possible duplicate");
  });

  it("does not flag the same invoice number from a different vendor", () => {
    // Brightline's INV-889 is a different bill from Acme's INV-889.
    expect(checkDuplicate(vendor, s("INV-889", "INV-889 header"), priors).result).toBe("pass");
  });

  it("sends an uncertain invoice-number read to a person, since a misread could hide a duplicate", () => {
    const t = checkDuplicate(vendor, s("INV-0870", "INV-0870 header", 0.6), priors);
    expect(t.result).toBe("needs_review");
    expect(t.reason).toContain("could hide a duplicate");
  });

  it("never passes a blank invoice number", () => {
    expect(checkDuplicate(vendor, s("", "INV header"), priors).result).toBe("needs_review");
  });
});

describe("duplicate check without history", () => {
  it("never passes when the processed-invoice history is unavailable", () => {
    const t = checkDuplicate(vendor, s("INV-889", "INV-889 header"), null);
    expect(t.result).toBe("needs_review");
    expect(t.reason).toContain("history of processed invoices was not available");
  });
});
