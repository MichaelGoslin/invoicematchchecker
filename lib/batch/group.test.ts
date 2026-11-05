import { describe, expect, it } from "vitest";
import { doc, result, s15, t } from "../extract/testDocs";
import { runSet } from "../match/runSet";
import { toMatchInput } from "../extract/toMatchInput";
import { type BatchDocument, groupBatch } from "./group";

const bd = (id: string, extraction: BatchDocument["extraction"]): BatchDocument => ({ id, extraction });

/** A second, unrelated set: PO-2001 with its receiving report and invoice. */
const other = {
  po: result("po-2001.pdf", doc({ document_type: "purchase_order", document_number: t("PO-2001"), vendor: t("Cedar Lane Packaging") })),
  rr: result("rr-700.pdf", doc({ document_type: "receiving_report", document_number: t("RR-700"), po_reference: t("PO 2001") })),
  inv: result("clp-5512.pdf", doc({ document_type: "invoice", document_number: t("CLP-5512"), vendor: t("Cedar Lane Packaging"), po_reference: t("po-2001") })),
};

describe("grouping a batch into sets", () => {
  it("joins each invoice to its PO and receiving report by PO number, whatever order they arrive in", () => {
    const { sets, setAside } = groupBatch([
      bd("d1", other.inv),
      bd("d2", s15.purchaseOrder),
      bd("d3", other.po),
      bd("d4", s15.invoice),
      bd("d5", s15.receivingReport),
      bd("d6", other.rr),
    ]);
    expect(setAside).toEqual([]);
    expect(sets.map((s) => s.documentIds)).toEqual([
      ["d1", "d3", "d6"],
      ["d4", "d2", "d5"],
    ]);
  });

  it("makes a set even when the invoice's PO wasn't uploaded, so the engine can say so", () => {
    const { sets } = groupBatch([bd("i", s15.invoice)]);
    expect(sets).toHaveLength(1);
    const { traces } = runSet(toMatchInput("S-x", sets[0]!.documents, []));
    expect(traces.find((x) => x.rule === "cited_po_on_file")).toMatchObject({ result: "fail" });
  });

  it("attaches nothing to an invoice whose PO reference was read uncertainly", () => {
    const shaky = result("inv.pdf", doc({ ...s15.invoice.document, po_reference: t("PO-1077", 0.6) }));
    const { sets, setAside } = groupBatch([bd("i", shaky), bd("p", s15.purchaseOrder)]);
    expect(sets[0]!.documentIds).toEqual(["i"]);
    expect(setAside).toEqual([{ documentId: "p", fileName: "po-1077.pdf", reason: "No invoice in this batch cites this PO." }]);
  });

  it("sets aside documents it can't identify, with a reason", () => {
    const unknown = result("photo.jpg", doc({ document_type: "other" }));
    const { sets, setAside } = groupBatch([bd("a", unknown), bd("b", { ...s15.invoice, name: "scan.pdf", document: { ...s15.invoice.document, document_type_confidence: 0.5 } })]);
    expect(sets).toEqual([]);
    expect(setAside.map((s) => s.reason)).toEqual([
      "Not recognized as a purchase order, receiving report or invoice.",
      "Read as an invoice at confidence 0.50; a person needs to say what it is.",
    ]);
  });

  it("refuses to guess between two POs with the same number", () => {
    const { sets, setAside } = groupBatch([bd("i", s15.invoice), bd("p1", s15.purchaseOrder), bd("p2", { ...s15.purchaseOrder, name: "po-copy.pdf" })]);
    expect(sets[0]!.documentIds).toEqual(["i"]);
    expect(setAside.map((s) => s.documentId).sort()).toEqual(["p1", "p2"]);
  });

  it("gives each of two invoices on the same PO its own set", () => {
    const second = result("bp-2241.pdf", doc({ ...s15.invoice.document, document_number: t("BP-2241") }));
    const { sets } = groupBatch([bd("i1", s15.invoice), bd("i2", second), bd("p", s15.purchaseOrder), bd("r", s15.receivingReport)]);
    expect(sets.map((s) => s.documentIds)).toEqual([
      ["i1", "p", "r"],
      ["i2", "p", "r"],
    ]);
  });
});
