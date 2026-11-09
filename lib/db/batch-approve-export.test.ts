import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { doc, line, n, result, s15 } from "../extract/testDocs";
import { toCsv } from "../export/csv";
import { type Truth, truthToMatchInput } from "../match/answerKey";
import { approveAllClean, countReadyToExport, exportApproved, listCleanPending } from "./approvals";
import { BatchAlreadyMatchedError, BatchNotFoundError, createBatch, matchBatch, saveDocument } from "./batches";
import type { Db } from "./db";
import { getSet, matchAndSave, recordDecision } from "./sets";
import { createTestDb } from "./testDb";

const truth = (id: string) => JSON.parse(readFileSync(`sample-data/output/sets/${id}/truth.json`, "utf8")) as Truth;

/** Saves one of Joan's sets from printed values. `uncertain` lowers one read so the set is gated. */
const save = (db: Db, id: string, opts: { asId?: string; uncertain?: boolean } = {}) => {
  const t0 = { ...truth(id), setId: opts.asId ?? id };
  return matchAndSave(db, {
    build: (priors) => {
      const input = truthToMatchInput(t0, priors);
      if (opts.uncertain) input.invoiceTotal = { ...input.invoiceTotal, confidence: 0.6 };
      return input;
    },
    invoiceVendor: t0.invoice.vendor,
    invoiceNumber: t0.invoice.number,
    invoiceTotal: Number(t0.invoice.total),
    invoiceDate: "2026-10-29",
    poNumber: t0.po?.number ?? null,
    documents: { source: "truth.json" },
  });
};

/** S-15's documents with a clean invoice, so the set comes out clean. */
const cleanInvoice = result(
  "bp-2240.pdf",
  doc({ ...s15.invoice.document, lines: [line(1, 10, 18, 180), line(2, 4, 9.5, 38), line(3, 6, 3, 18)], tax: n(20.94), total: n(256.94) }),
);

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("batch upload", () => {
  it("groups the batch's documents into sets, saves them, and records which documents built each set", async () => {
    const batchId = await createBatch(db);
    await saveDocument(db, batchId, s15.receivingReport, "D-rr");
    await saveDocument(db, batchId, cleanInvoice, "D-inv");
    await saveDocument(db, batchId, s15.purchaseOrder, "D-po");
    await saveDocument(db, batchId, result("menu.pdf", doc({ document_type: "other" })), "D-x");

    const out = await matchBatch(db, batchId);
    expect(out.sets).toHaveLength(1);
    expect(out.sets[0]!.decision).toMatchObject({ recommendation: "approve", reason: "clean" });
    expect(out.setAside).toEqual([{ documentId: "D-x", fileName: "menu.pdf", reason: "Not recognized as a purchase order, receiving report or invoice." }]);

    const links = await db.query<{ document_id: string }>("select document_id from set_documents where set_id = $1 order by document_id", [out.sets[0]!.setId]);
    expect(links.map((l) => l.document_id)).toEqual(["D-inv", "D-po", "D-rr"]);
    const { set } = (await getSet(db, out.sets[0]!.setId))!;
    expect(set).toMatchObject({ batchId, poNumber: "PO-1077", invoiceNumber: "BP-2240" });
  });

  it("matches a batch once, and takes no documents after that", async () => {
    const batchId = await createBatch(db);
    await saveDocument(db, batchId, cleanInvoice);
    await matchBatch(db, batchId);
    await expect(matchBatch(db, batchId)).rejects.toBeInstanceOf(BatchAlreadyMatchedError);
    await expect(saveDocument(db, batchId, s15.purchaseOrder)).rejects.toBeInstanceOf(BatchAlreadyMatchedError);
    await expect(matchBatch(db, "B-missing")).rejects.toBeInstanceOf(BatchNotFoundError);
  });

  it("catches the same invoice uploaded twice in one batch as a duplicate", async () => {
    const batchId = await createBatch(db);
    await saveDocument(db, batchId, cleanInvoice);
    await saveDocument(db, batchId, { ...cleanInvoice, name: "bp-2240-copy.pdf" });
    await saveDocument(db, batchId, s15.purchaseOrder);
    await saveDocument(db, batchId, s15.receivingReport);
    const out = await matchBatch(db, batchId);
    expect(out.sets.map((s) => s.decision.recommendation)).toEqual(["approve", "reject"]);
    expect(out.sets[1]!.decision.drivers[0]!.rule).toBe("not_a_duplicate");
  });
});

describe("approve all clean", () => {
  it("approves only clean, ungated sets and logs each approval as a bulk action", async () => {
    await save(db, "S-002"); // clean
    await save(db, "S-003"); // clean
    await save(db, "S-001"); // exception
    await save(db, "S-004", { uncertain: true }); // gated
    expect(await listCleanPending(db)).toEqual(["S-002", "S-003"]);

    const { approved, skipped } = await approveAllClean(db, "Michael");
    expect(approved).toEqual(["S-002", "S-003"]);
    expect(skipped).toEqual([]);
    expect((await getSet(db, "S-001"))!.set.status).toBe("pending");
    expect((await getSet(db, "S-004"))!.set.status).toBe("pending");
    const { audit } = (await getSet(db, "S-002"))!;
    expect(audit[1]).toMatchObject({ actor: "Michael", action: "approved", detail: { bulk: true, overridden: false } });
  });

  it("needs a name", async () => {
    await save(db, "S-002");
    await expect(approveAllClean(db, " ")).rejects.toThrow(/name/);
  });
});

describe("export", () => {
  it("exports each approved set once, marks it exported and logs it", async () => {
    await save(db, "S-002");
    await save(db, "S-001");
    await recordDecision(db, { setId: "S-002", action: "approve", actor: "Michael" });
    await recordDecision(db, { setId: "S-001", action: "approve", actor: "Joan", reason: "Credit memo for the short units." });
    expect(await countReadyToExport(db)).toBe(2);

    const rows = await exportApproved(db, "Michael");
    // Rows come out by decision time, then id. Both decisions can land in the same
    // clock tick, so compare by set id rather than assume which was stamped first.
    const bySetId = [...rows].sort((a, b) => a.setId.localeCompare(b.setId));
    expect(bySetId.map((r) => [r.setId, r.approvedBy, r.overridden])).toEqual([
      ["S-001", "Joan", true],
      ["S-002", "Michael", false],
    ]);
    expect(rows.find((r) => r.setId === "S-002")).toMatchObject({ invoiceNumber: truth("S-002").invoice.number, invoiceTotal: truth("S-002").invoice.total, poNumber: truth("S-002").po!.number });
    expect(await countReadyToExport(db)).toBe(0);
    expect(await exportApproved(db, "Michael")).toEqual([]);
    const { audit, set } = (await getSet(db, "S-002"))!;
    expect(set.exportedAt).toBeInstanceOf(Date);
    expect(audit.map((a) => a.action)).toEqual(["recommended", "approved", "exported"]);
  });

  it("never exports a set that isn't approved", async () => {
    await save(db, "S-002");
    await recordDecision(db, { setId: "S-002", action: "reject", actor: "Joan", reason: "Wrong cost center." });
    expect(await exportApproved(db, "Michael")).toEqual([]);
    await expect(db.query("update invoice_sets set exported_at = now() where id = 'S-002'")).rejects.toThrow(/exported_only_if_approved/);
  });
});

describe("CSV", () => {
  const row = {
    setId: "S-1",
    vendor: "Maple & Vine, Janitorial",
    invoiceNumber: "MVJ-2680",
    invoiceDate: "2026-10-29",
    poNumber: "PO-1042",
    invoiceTotal: "1234.50",
    approvedBy: "Joan",
    approvedAt: new Date("2026-11-05T17:00:00Z"),
    overridden: true,
    overrideReason: 'Vendor said "credit next month"',
  };

  it("writes a header and quotes commas and quotes", () => {
    expect(toCsv([row])).toBe(
      "set_id,vendor,invoice_number,invoice_date,po_number,invoice_total,approved_by,approved_at,override,override_reason\r\n" +
        'S-1,"Maple & Vine, Janitorial",MVJ-2680,2026-10-29,PO-1042,1234.50,Joan,2026-11-05T17:00:00.000Z,yes,"Vendor said ""credit next month"""\r\n',
    );
  });

  it("neutralizes cells a spreadsheet would run as formulas", () => {
    const csv = toCsv([{ ...row, vendor: '=HYPERLINK("http://evil.example","Click")', overrideReason: "-2+3", invoiceNumber: "@SUM(A1)" }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""Click"")"`);
    expect(csv).toContain(`"'-2+3"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
  });
});
