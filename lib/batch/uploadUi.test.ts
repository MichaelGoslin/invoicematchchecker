import { describe, expect, it } from "vitest";
import { addFiles, documentTypeLabel, formatSize, MAX_BYTES, progress, tally } from "./uploadUi";

const f = (name: string, size = 1000) => ({ name, size });

describe("addFiles", () => {
  it("accepts PDFs, images and text files", () => {
    const r = addFiles([], [f("po.pdf"), f("scan.JPG"), f("inv.png"), f("note.txt")]);
    expect(r.files.map((x) => x.name)).toEqual(["po.pdf", "scan.JPG", "inv.png", "note.txt"]);
    expect(r.rejected).toEqual([]);
  });

  it("turns away the wrong type, empty files and files over 20 MB, with a reason", () => {
    const r = addFiles([], [f("sheet.xlsx"), f("empty.pdf", 0), f("huge.pdf", MAX_BYTES + 1), f("noext")]);
    expect(r.files).toEqual([]);
    expect(r.rejected.map((x) => x.name)).toEqual(["sheet.xlsx", "empty.pdf", "huge.pdf", "noext"]);
    expect(r.rejected[1]!.reason).toBe("The file is empty.");
    expect(r.rejected[2]!.reason).toMatch(/Over 20 MB/);
  });

  it("accepts a file of exactly 20 MB", () => {
    expect(addFiles([], [f("edge.pdf", MAX_BYTES)]).files).toHaveLength(1);
  });

  it("keeps earlier files and refuses an exact repeat but not a same-named different file", () => {
    const first = addFiles([], [f("a.pdf", 10)]).files;
    const r = addFiles(first, [f("a.pdf", 10), f("a.pdf", 11), f("b.pdf", 5)]);
    expect(r.files.map((x) => `${x.name}:${x.size}`)).toEqual(["a.pdf:10", "a.pdf:11", "b.pdf:5"]);
    expect(r.rejected).toEqual([{ name: "a.pdf", reason: "Already added." }]);
  });
});

describe("progress", () => {
  it("counts finished and failed files and gives a percentage", () => {
    expect(progress(["read", "failed", "reading", "waiting"])).toEqual({ total: 4, finished: 2, failed: 1, percent: 50 });
  });
  it("handles an empty batch and a finished one", () => {
    expect(progress([])).toEqual({ total: 0, finished: 0, failed: 0, percent: 0 });
    expect(progress(["read", "read"]).percent).toBe(100);
  });
});

describe("labels and sizes", () => {
  it("names document types in plain words", () => {
    expect(documentTypeLabel("purchase_order")).toBe("Purchase order");
    expect(documentTypeLabel("receiving_report")).toBe("Receiving report");
    expect(documentTypeLabel("invoice")).toBe("Invoice");
    expect(documentTypeLabel("unknown")).toBe("Other document");
    expect(documentTypeLabel(null)).toBe("Other document");
  });
  it("formats sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
  it("tallies recommendations and ignores unknown ones", () => {
    expect(tally([{ recommendation: "approve" }, { recommendation: "review" }, { recommendation: "review" }, { recommendation: "?" }])).toEqual({ approve: 1, review: 2, reject: 0 });
  });
});
