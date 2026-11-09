import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { sessionToken } from "../auth/session";
import { createBatch, newDocumentId, saveDocument } from "../db/batches";
import type { Db } from "../db/db";
import { createTestDb } from "../db/testDb";
import { s15 } from "../extract/testDocs";
import { contentDisposition, DOCUMENT_ID, serveDocument } from "./serve";

const PASSCODE = "test-passcode";
const ON = { APP_PASSCODE: PASSCODE, NODE_ENV: "production" };
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let db: Db;
let batchId: string;
let goodSession: string;
beforeEach(async () => {
  db = await createTestDb();
  batchId = await createBatch(db);
  goodSession = await sessionToken(PASSCODE);
});

/** A database that fails the test if anything reaches it. */
const untouchable: Db = {
  query: async () => {
    throw new Error("the database was queried");
  },
  transaction: async () => {
    throw new Error("the database was queried");
  },
};

const store = (name: string, mediaType: "application/pdf" | "image/png" | "image/jpeg" | "text/plain", data: Buffer | string) =>
  // As in production, the stored name is the uploaded file's name, carried on the extraction.
  saveDocument(db, batchId, { ...s15.invoice, name }, newDocumentId(), { name, mediaType, data });

const serve = (id: string, session: string | undefined = goodSession, env: Record<string, string> = ON) =>
  serveDocument(db, id, { session, env });

describe("who can get a file", () => {
  it("refuses a signed-out request before looking anything up", async () => {
    const res = await serveDocument(untouchable, newDocumentId(), { session: undefined, env: ON });
    expect(res.status).toBe(401);
  });

  it("refuses a forged or stale cookie before looking anything up", async () => {
    for (const session of ["", "not-a-token", await sessionToken("old-passcode"), goodSession.toUpperCase()]) {
      const res = await serveDocument(untouchable, newDocumentId(), { session, env: ON });
      expect(res.status).toBe(401);
    }
  });

  it("serves nothing when production has no passcode set", async () => {
    const res = await serveDocument(untouchable, newDocumentId(), { session: goodSession, env: { NODE_ENV: "production" } });
    expect(res.status).toBe(503);
  });

  it("serves a signed-in reviewer, and local dev without a passcode", async () => {
    const id = await store("invoice.pdf", "application/pdf", Buffer.from("%PDF-1.4 test"));
    expect((await serve(id)).status).toBe(200);
    expect((await serve(id, undefined, { NODE_ENV: "development" })).status).toBe(200);
  });
});

describe("which ids are looked up", () => {
  it("only looks up ids shaped like the ones the app makes", async () => {
    expect(DOCUMENT_ID.test(newDocumentId())).toBe(true);
    const bad = [
      "",
      "D-",
      "../../etc/passwd",
      "D-1234abcd-123/../x",
      "D-1234ABCD-123",
      "D-1234abcd-1234",
      "D-1234abcd-123\n",
      "D-' or '1'='1",
      "S-1234abcd",
      "B-1234abcd",
      "D-1234abcd-12%",
    ];
    for (const id of bad) {
      const res = await serveDocument(untouchable, id, { session: goodSession, env: ON });
      expect(res.status, JSON.stringify(id)).toBe(404);
    }
  });

  it("answers an unknown id and a document stored without a file the same way", async () => {
    const noFile = await saveDocument(db, batchId, s15.invoice);
    const [unknown, missing] = await Promise.all([serve(newDocumentId()), serve(noFile)]);
    expect(unknown.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await unknown.json()).toEqual(await missing.json());
  });
});

describe("what the browser is told", () => {
  it("returns the exact bytes that were uploaded", async () => {
    const pdf = readFileSync("sample-data/output/sets/S-087/po.pdf");
    const res = await serve(await store("po.pdf", "application/pdf", pdf));
    const body = new Uint8Array(await res.arrayBuffer());
    expect(sha(body)).toBe(sha(pdf));
    expect(res.headers.get("content-length")).toBe(String(pdf.length));
  });

  it("serves HTML disguised as a PDF as a PDF, with sniffing off", async () => {
    const res = await serve(await store("invoice.pdf", "application/pdf", "<html><script>alert(1)</script></html>"));
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sandboxes text files, and leaves PDFs and images unsandboxed so they display", async () => {
    const txt = await serve(await store("note.txt", "text/plain", "<script>alert(1)</script>"));
    expect(txt.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(txt.headers.get("content-security-policy")).toContain("sandbox");
    for (const [name, type] of [["a.pdf", "application/pdf"], ["a.png", "image/png"], ["a.jpg", "image/jpeg"]] as const) {
      const res = await serve(await store(name, type, Buffer.from("x")));
      expect(res.headers.get("content-type")).toBe(type);
      expect(res.headers.get("content-security-policy")).toBeNull();
    }
  });

  it("is never cached, on success or refusal", async () => {
    const ok = await serve(await store("a.pdf", "application/pdf", Buffer.from("x")));
    const refused = await serve(newDocumentId(), undefined);
    for (const res of [ok, refused]) expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("referrer-policy")).toBe("no-referrer");
    expect(ok.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("can't be framed by another site", async () => {
    const res = await serve(await store("a.pdf", "application/pdf", Buffer.from("x")));
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

describe("file names in the header", () => {
  it("can't break out of the header or the quoted name", () => {
    const value = contentDisposition('evil"; filename="x.html\r\nSet-Cookie: a=b.pdf');
    expect(value).not.toMatch(/[\r\n]/);
    const quoted = value.match(/filename="([^"]*)"/)?.[1];
    expect(quoted).toBe("evil_; filename=_x.htmlSet-Cookie: a=b.pdf");
    expect(value.match(/filename="/g)).toHaveLength(1);
  });

  it("keeps a non-ASCII name in the encoded form", () => {
    const value = contentDisposition("Façture (1).pdf");
    expect(value).toBe(`inline; filename="Fa_ture (1).pdf"; filename*=UTF-8''Fa%C3%A7ture%20%281%29.pdf`);
    expect(decodeURIComponent(value.split("''")[1] ?? "")).toBe("Façture (1).pdf");
  });

  it("falls back to a name when there isn't one", () => {
    expect(contentDisposition("\r\n")).toBe(`inline; filename="document"; filename*=UTF-8''document`);
  });

  it("is what the route sends", async () => {
    const res = await serve(await store("PO 4471.pdf", "application/pdf", Buffer.from("x")));
    expect(res.headers.get("content-disposition")).toBe(contentDisposition("PO 4471.pdf"));
  });
});
