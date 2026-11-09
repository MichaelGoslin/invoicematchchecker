import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { DocumentInput } from "../extract/extract";
import { s15 } from "../extract/testDocs";
import { createBatch, getDocumentFile, saveDocument } from "./batches";
import type { Db } from "./db";
import { createTestDb } from "./testDb";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const file = (name: string, mediaType: DocumentInput["mediaType"], data: Buffer | string): DocumentInput => ({ name, mediaType, data });

let db: Db;
let batchId: string;
beforeEach(async () => {
  db = await createTestDb();
  batchId = await createBatch(db);
});

describe("stored document files", () => {
  it("comes back byte-identical, as a Buffer", async () => {
    const cases = [
      file("every-byte.pdf", "application/pdf", Buffer.from(Array.from({ length: 256 }, (_, i) => i))),
      file("invoice.jpg", "image/jpeg", readFileSync("sample-data/output/sets/S-087/invoice.jpg")),
      file("po.pdf", "application/pdf", readFileSync("sample-data/output/sets/S-087/po.pdf")),
    ];
    for (const [i, f] of cases.entries()) {
      const id = await saveDocument(db, batchId, s15.invoice, `D-file${i}`, f);
      const stored = await getDocumentFile(db, id);
      expect(Buffer.isBuffer(stored?.data)).toBe(true);
      expect(stored?.data.length).toBe((f.data as Buffer).length);
      expect(sha(stored!.data)).toBe(sha(f.data as Buffer));
      expect(stored?.mediaType).toBe(f.mediaType);
    }
  });

  it("stores text given as a string as UTF-8 bytes", async () => {
    const id = await saveDocument(db, batchId, s15.invoice, "D-txt", file("note.txt", "text/plain", "Café total: €12"));
    const stored = await getDocumentFile(db, id);
    expect(stored?.data.toString("utf8")).toBe("Café total: €12");
    expect(stored?.mediaType).toBe("text/plain");
  });

  it("returns null for a document saved without a file, and for an unknown id", async () => {
    const id = await saveDocument(db, batchId, s15.invoice, "D-nofile");
    expect(await getDocumentFile(db, id)).toBeNull();
    expect(await getDocumentFile(db, "D-doesnotexist")).toBeNull();
  });

  it("still accepts the insert the code in production uses today, which doesn't name the new columns", async () => {
    await db.query("insert into documents (id, batch_id, file_name, document_type, extraction) values ($1, $2, $3, $4, $5::jsonb)", [
      "D-old",
      batchId,
      "old.pdf",
      "invoice",
      s15.invoice,
    ]);
    expect(await getDocumentFile(db, "D-old")).toBeNull();
  });
});

describe("document file constraints", () => {
  const insert = (id: string, content: Buffer | null, mediaType: string | null) =>
    db.query(
      "insert into documents (id, batch_id, file_name, document_type, extraction, content, media_type) values ($1, $2, 'x', 'invoice', '{}'::jsonb, $3, $4)",
      [id, batchId, content, mediaType],
    );

  it("refuses a type an upload can't be", async () => {
    await expect(insert("D-html", Buffer.from("<script>"), "text/html")).rejects.toThrow(/documents_media_type_allowed/);
  });

  it("refuses a file without a type, or a type without a file", async () => {
    await expect(insert("D-a", Buffer.from("x"), null)).rejects.toThrow(/documents_file_complete/);
    await expect(insert("D-b", null, "application/pdf")).rejects.toThrow(/documents_file_complete/);
  });
});

describe("migration 004", () => {
  it("is recorded and keeps row-level security on documents", async () => {
    const applied = await db.query<{ name: string }>("select name from schema_migrations where name = '004_document_files.sql'");
    expect(applied).toHaveLength(1);
    const [rls] = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = 'documents'");
    expect(rls?.relrowsecurity).toBe(true);
  });
});
