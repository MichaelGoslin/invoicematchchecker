import { describe, expect, it } from "vitest";
import { documentLinks } from "./documentLinks";

describe("documentLinks", () => {
  it("orders links invoice, PO, receiving report", () => {
    const links = documentLinks([
      { id: "D-3", type: "receiving_report", hasFile: true },
      { id: "D-1", type: "invoice", hasFile: true },
      { id: "D-2", type: "purchase_order", hasFile: true },
    ]);
    expect(links.map((l) => l.label)).toEqual(["View invoice", "View PO", "View receiving report"]);
    expect(links[0]!.href).toBe("/api/documents/D-1");
  });

  it("hides the link when there is no stored file", () => {
    expect(documentLinks([{ id: "D-1", type: "invoice", hasFile: false }])).toEqual([]);
  });

  it("ignores document types it has no label for", () => {
    expect(documentLinks([{ id: "D-1", type: "other", hasFile: true }])).toEqual([]);
  });
});
