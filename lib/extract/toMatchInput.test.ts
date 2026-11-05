import { describe, expect, it } from "vitest";
import { runSet } from "../match/runSet";
import { doc, line, n, result, s15, t } from "./testDocs";
import { SetAssemblyError, toMatchInput } from "./toMatchInput";

const rulesWith = (traces: { rule: string; result: string }[], r: string) =>
  traces.filter((x) => x.result === r).map((x) => x.rule);

describe("extracted documents to a decision", () => {
  it("S-15 read from documents gives the same flags and decision as its answer key", () => {
    const { traces, decision } = runSet(toMatchInput("S-15", s15, []));
    expect(rulesWith(traces, "fail")).toEqual(["quantity_not_over_received", "unit_price_within_tolerance"]);
    expect(rulesWith(traces, "needs_review")).toEqual([
      "quantity_not_over_ordered",
      "quantity_not_over_received",
      "unit_price_within_tolerance",
      "line_total_equals_qty_times_price",
      "invoice_total_equals_sum",
    ]);
    expect(decision).toMatchObject({ recommendation: "review", reason: "gated" });
  });

  it("labels sources with document numbers and pages", () => {
    const input = toMatchInput("S-15", s15, []);
    expect(input.lines[1]!.invoicePrice.source).toBe("BP-2240 line 2 price, p.1");
    expect(input.lines[0]!.received!.source).toBe("RR-560 line 1, p.1");
  });

  it("recommends approval for a clean set read from documents", () => {
    const fixed = {
      ...s15,
      invoice: result(
        "bp-2240.pdf",
        doc({
          ...s15.invoice.document,
          lines: [line(1, 10, 18, 180), line(2, 4, 9.5, 38), line(3, 6, 3, 18)],
          tax: n(20.94),
          total: n(256.94),
        }),
      ),
    };
    expect(runSet(toMatchInput("S-15b", fixed, [])).decision.recommendation).toBe("approve");
  });

  it("does not quietly downgrade to a 2-way match when the receiving report is missing", () => {
    const { traces } = runSet(toMatchInput("S-15", { purchaseOrder: s15.purchaseOrder, invoice: s15.invoice }, []));
    expect(traces.find((x) => x.rule === "receiving_exists")).toMatchObject({ result: "fail" });
    expect(traces.some((x) => x.rule === "quantity_not_over_received")).toBe(false);
  });

  it("runs a 2-way match only when asked to", () => {
    const { traces } = runSet(
      toMatchInput("S-15", { purchaseOrder: s15.purchaseOrder, invoice: s15.invoice }, [], { matchType: "2-way" }),
    );
    expect(traces.some((x) => x.rule === "receiving_exists")).toBe(false);
  });

  it("marks a set incomplete when the invoice clearly cites a PO that wasn't uploaded", () => {
    const clean = result(
      "bp.pdf",
      doc({ ...s15.invoice.document, lines: [line(1, 10, 18, 180), line(2, 4, 9.5, 38), line(3, 6, 3, 18)], tax: n(20.94), total: n(256.94) }),
    );
    const { decision, traces } = runSet(toMatchInput("S-x", { receivingReport: s15.receivingReport, invoice: clean }, []));
    expect(decision).toMatchObject({ recommendation: "review", reason: "incomplete" });
    expect(traces.find((x) => x.rule === "cited_po_on_file")).toMatchObject({ result: "fail" });
    expect(traces.find((x) => x.rule === "cited_po_on_file")!.reason).toContain("The invoice cites PO-1077");
    expect(traces.some((x) => x.rule === "unit_price_within_tolerance")).toBe(false);
  });

  it("recommends rejection when the invoice cites no PO and none was uploaded", () => {
    const noRef = result("bp.pdf", doc({ ...s15.invoice.document, po_reference: t(null) }));
    const { decision, traces } = runSet(toMatchInput("S-x", { receivingReport: s15.receivingReport, invoice: noRef }, []));
    expect(traces.find((x) => x.rule === "po_exists")).toMatchObject({ result: "fail" });
    expect(decision.recommendation).not.toBe("approve");
  });

  it("gates the set when the PO reference was read uncertainly and no PO matched", () => {
    const shaky = result("bp.pdf", doc({ ...s15.invoice.document, po_reference: t("PO-1O77", 0.55) }));
    const { decision, traces } = runSet(toMatchInput("S-x", { receivingReport: s15.receivingReport, invoice: shaky }, []));
    expect(traces.find((x) => x.rule === "po_exists")).toMatchObject({ result: "needs_review" });
    expect(decision.reason).toBe("gated");
  });

  it("sends an invoice line with no matching PO line to a person", () => {
    const extra = result("bp.pdf", doc({ ...s15.invoice.document, lines: [...s15.invoice.document.lines, line(4, 1, 5, 5)] }));
    const { traces } = runSet(toMatchInput("S-x", { ...s15, invoice: extra }, []));
    const line4 = traces.filter((x) => x.lineIndex === 3);
    expect(line4.find((x) => x.rule === "unit_price_within_tolerance")).toMatchObject({ result: "needs_review" });
    expect(line4.find((x) => x.rule === "quantity_not_over_ordered")!.expected.source).toBe("PO-1077 has no line 4");
  });

  it("sends a missing invoice total to a person", () => {
    const noTotal = result("bp.pdf", doc({ ...s15.invoice.document, total: n(null) }));
    const { traces } = runSet(toMatchInput("S-x", { ...s15, invoice: noTotal }, []));
    expect(traces.find((x) => x.rule === "invoice_total_equals_sum")!.result).toBe("needs_review");
  });

  it("gates the set when Claude was unsure what kind of document the invoice is", () => {
    const unsure = result("bp.pdf", doc({ ...s15.invoice.document, document_type_confidence: 0.6, lines: s15.purchaseOrder.document.lines }));
    const { decision } = runSet(toMatchInput("S-x", { ...s15, invoice: unsure }, []));
    expect(decision.gated).toBe(true);
  });

  it("refuses to build a set from a document uploaded in the wrong slot", () => {
    expect(() => toMatchInput("S-x", { ...s15, invoice: s15.purchaseOrder }, [])).toThrow(SetAssemblyError);
    expect(() => toMatchInput("S-x", { ...s15, invoice: s15.purchaseOrder }, [])).toThrow(
      "po-1077.pdf was read as purchase_order, but was uploaded as the invoice.",
    );
  });

  it("finds a duplicate using the invoice number Claude read", () => {
    const priors = [{ vendor: "Brightline Paper", invoiceNumber: "BP 2240", ref: "set S-02, approved 2026-11-01" }];
    const { decision } = runSet(toMatchInput("S-15", { ...s15, invoice: result("bp.pdf", doc({ ...s15.invoice.document, lines: [line(2, 4, 9.5, 38)], tax: n(null), total: n(38) })) }, priors));
    expect(decision).toMatchObject({ recommendation: "reject" });
    expect(decision.drivers[0]!.actual.source).toBe("set S-02, approved 2026-11-01");
  });
});
