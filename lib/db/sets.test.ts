import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { type Truth, truthToMatchInput } from "../match/answerKey";
import type { Db } from "./db";
import { migrate } from "./migrate";
import {
  getSet,
  isOverride,
  listQueue,
  loadPriors,
  matchAndSave,
  ReasonRequiredError,
  recordDecision,
  SetAlreadyDecidedError,
  SetNotFoundError,
} from "./sets";
import { createTestDb } from "./testDb";

const truth = (id: string) => JSON.parse(readFileSync(`sample-data/output/sets/${id}/truth.json`, "utf8")) as Truth;

/** Saves one of Joan's sample sets, optionally under a new id (a resubmission). */
const save = (db: Db, id: string, asId = id) => {
  const t = { ...truth(id), setId: asId };
  return matchAndSave(db, {
    build: (priors) => truthToMatchInput(t, priors),
    invoiceVendor: t.invoice.vendor,
    invoiceNumber: t.invoice.number,
    invoiceTotal: Number(t.invoice.total),
    documents: { source: "truth.json" },
  });
};

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("migrations", () => {
  it("apply once and are skipped on the next run", async () => {
    expect(await migrate(db)).toEqual([]);
  });
});

describe("saving a set", () => {
  it("stores the recommendation, the invoice for duplicate checks and an audit entry", async () => {
    const { decision } = await save(db, "S-002");
    expect(decision.recommendation).toBe("approve");
    const stored = await getSet(db, "S-002");
    expect(stored!.set).toMatchObject({ status: "pending", invoiceNumber: truth("S-002").invoice.number, overridden: false });
    expect(stored!.audit).toEqual([expect.objectContaining({ actor: "engine", action: "recommended" })]);
    expect(await loadPriors(db)).toHaveLength(1);
  });

  it("flags a resubmission of a stored invoice as a duplicate, even while the first is pending", async () => {
    await save(db, "S-002");
    const { decision } = await save(db, "S-002", "S-002-again");
    expect(decision).toMatchObject({ recommendation: "reject", reason: "reject" });
    expect(decision.drivers[0]).toMatchObject({ rule: "not_a_duplicate", result: "fail" });
    expect(decision.drivers[0]!.actual.source).toMatch(/^set S-002, pending review \d{4}-\d{2}-\d{2}$/);
  });

  it("does not treat a rejected invoice as a prior, so a corrected resubmission can be checked fresh", async () => {
    await save(db, "S-001");
    await recordDecision(db, { setId: "S-001", action: "reject", actor: "Joan" });
    const { decision } = await save(db, "S-001", "S-001-corrected");
    expect(decision.drivers.some((d) => d.rule === "not_a_duplicate")).toBe(false);
  });
});

describe("recording a decision", () => {
  it("approves a recommended set without a reason and marks the invoice approved", async () => {
    await save(db, "S-002");
    const set = await recordDecision(db, { setId: "S-002", action: "approve", actor: "Michael" });
    expect(set).toMatchObject({ status: "approved", decidedBy: "Michael", overridden: false, overrideReason: null });
    expect((await loadPriors(db))[0]!.ref).toMatch(/approved/);
    const { audit } = (await getSet(db, "S-002"))!;
    expect(audit.map((a) => a.action)).toEqual(["recommended", "approved"]);
  });

  it("requires a reason to approve a set the engine sent to review, and records the override", async () => {
    await save(db, "S-001");
    await expect(recordDecision(db, { setId: "S-001", action: "approve", actor: "Joan" })).rejects.toBeInstanceOf(ReasonRequiredError);
    const set = await recordDecision(db, { setId: "S-001", action: "approve", actor: "Joan", reason: "Vendor credited the 4 missing units." });
    expect(set).toMatchObject({ status: "approved", overridden: true, overrideReason: "Vendor credited the 4 missing units." });
    const { audit } = (await getSet(db, "S-001"))!;
    expect(audit[1]!.detail).toMatchObject({ recommendation: "review", overridden: true, reason: "Vendor credited the 4 missing units." });
  });

  it("requires a reason to reject a set the engine recommended approving", async () => {
    await save(db, "S-002");
    await expect(recordDecision(db, { setId: "S-002", action: "reject", actor: "Joan", reason: "  " })).rejects.toBeInstanceOf(
      ReasonRequiredError,
    );
  });

  it("rejects a set sent to review without needing a reason", async () => {
    await save(db, "S-001");
    expect((await recordDecision(db, { setId: "S-001", action: "reject", actor: "Joan" })).overridden).toBe(false);
  });

  it("refuses a second decision on the same set", async () => {
    await save(db, "S-002");
    await recordDecision(db, { setId: "S-002", action: "approve", actor: "Michael" });
    await expect(recordDecision(db, { setId: "S-002", action: "reject", actor: "Joan", reason: "x" })).rejects.toBeInstanceOf(
      SetAlreadyDecidedError,
    );
  });

  it("refuses a decision with no name, and on a set that does not exist", async () => {
    await save(db, "S-002");
    await expect(recordDecision(db, { setId: "S-002", action: "approve", actor: " " })).rejects.toBeInstanceOf(ReasonRequiredError);
    await expect(recordDecision(db, { setId: "S-999", action: "approve", actor: "Joan" })).rejects.toBeInstanceOf(SetNotFoundError);
  });

  it("defines an override as going against a definite recommendation", () => {
    expect(isOverride("approve", "approve")).toBe(false);
    expect(isOverride("approve", "review")).toBe(true);
    expect(isOverride("approve", "reject")).toBe(true);
    expect(isOverride("reject", "approve")).toBe(true);
    expect(isOverride("reject", "review")).toBe(false);
  });
});

describe("audit log", () => {
  it("cannot be edited or deleted", async () => {
    await save(db, "S-002");
    await expect(db.query("update audit_log set actor = 'someone else'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from audit_log")).rejects.toThrow(/append-only/);
  });
});

describe("queue", () => {
  it("lists pending sets in queue order, then decided sets", async () => {
    await save(db, "S-002"); // clean
    await save(db, "S-001"); // exception
    await save(db, "S-002", "S-002-again"); // duplicate: reject
    await save(db, "S-003"); // clean
    await recordDecision(db, { setId: "S-003", action: "approve", actor: "Michael" });
    const queue = await listQueue(db);
    expect(queue.map((s) => `${s.id}:${s.status}`)).toEqual([
      "S-002-again:pending",
      "S-001:pending",
      "S-002:pending",
      "S-003:approved",
    ]);
  });
});

describe("stored JSON", () => {
  it("is stored as JSON objects, not as strings of JSON", async () => {
    await save(db, "S-001");
    await recordDecision(db, { setId: "S-001", action: "reject", actor: "Joan" });
    const [set] = await db.query<{ d: string; t: string }>("select jsonb_typeof(decision) d, jsonb_typeof(traces) t from invoice_sets");
    expect(set).toEqual({ d: "object", t: "array" });
    const types = await db.query<{ k: string }>("select jsonb_typeof(detail) k from audit_log");
    expect(types.map((r) => r.k)).toEqual(["object", "object"]);
  });
});

describe("row-level security", () => {
  it("is on for every table, so Supabase's public API can't read or write them", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('invoice_sets','processed_invoices','audit_log','schema_migrations') order by relname",
    );
    expect(rows).toEqual([
      { relname: "audit_log", relrowsecurity: true },
      { relname: "invoice_sets", relrowsecurity: true },
      { relname: "processed_invoices", relrowsecurity: true },
      { relname: "schema_migrations", relrowsecurity: true },
    ]);
  });
});
