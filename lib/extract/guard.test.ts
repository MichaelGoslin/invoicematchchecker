import { describe, expect, it } from "vitest";
import { CAPPED_CONFIDENCE, guardDocument } from "./guard";
import { doc, line, n, t } from "./testDocs";

describe("confidence guard", () => {
  it("keeps Claude's confidence when the value appears in its quoted text", () => {
    const { document, notes } = guardDocument(doc({ document_type: "invoice", total: n(1234.5, 0.97, "TOTAL DUE $1,234.50") }));
    expect(document.total.confidence).toBe(0.97);
    expect(notes).toEqual([]);
  });

  it("caps a number that does not appear in its quoted text, and says why", () => {
    // Claude says 1234.50 but quoted 1,284.50: one of them is a misread.
    const { document, notes } = guardDocument(doc({ document_type: "invoice", total: n(1234.5, 0.99, "$1,284.50") }));
    expect(document.total.confidence).toBe(CAPPED_CONFIDENCE);
    expect(notes[0]).toContain("total: value 1234.5 does not appear");
  });

  it("caps a number with no quoted text at all", () => {
    const { document } = guardDocument(doc({ document_type: "invoice", total: n(10, 0.99, null) }));
    expect(document.total.confidence).toBe(CAPPED_CONFIDENCE);
  });

  it("caps a line value and names the line", () => {
    const l = { ...line(2, 4, 9.98, 39.92), quantity: n(4, 0.95, "40") };
    const { document, notes } = guardDocument(doc({ document_type: "invoice", lines: [l] }));
    expect(document.lines[0]!.quantity.confidence).toBe(CAPPED_CONFIDENCE);
    expect(notes[0]).toContain("line 2 quantity");
  });

  it("caps text that does not appear in its quoted text, ignoring case and punctuation", () => {
    const ok = guardDocument(doc({ document_type: "invoice", vendor: t("Acme Supply Co.", 0.95, "ACME SUPPLY CO") }));
    expect(ok.document.vendor.confidence).toBe(0.95);
    const bad = guardDocument(doc({ document_type: "invoice", vendor: t("Acme Supply Co.", 0.95, "Acme Supplies") }));
    expect(bad.document.vendor.confidence).toBe(CAPPED_CONFIDENCE);
  });

  it("sets confidence to 0 for a missing value, whatever Claude said", () => {
    const { document } = guardDocument(doc({ document_type: "invoice", total: { value: null, confidence: 0.9, evidence: null, page: null } }));
    expect(document.total.confidence).toBe(0);
  });

  it("never raises a confidence: out-of-range values are clamped", () => {
    const { document } = guardDocument(doc({ document_type: "invoice", total: n(10, 1.7), tax: n(1, Number.NaN) }));
    expect(document.total.confidence).toBe(1);
    expect(document.tax.confidence).toBe(0);
  });
});
