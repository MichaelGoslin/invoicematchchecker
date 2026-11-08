import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { listForSummary, todayIn } from "./summary";
import { createTestDb } from "./testDb";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

async function insert(id: string, row: { created: string; status?: string; decided?: string; exported?: string; total?: number }) {
  await db.query(
    `insert into invoice_sets (id, created_at, match_type, invoice_total, recommendation, decision_reason, decision_version,
       decision, traces, documents, status, decided_at, decided_by, exported_at)
     values ($1, $2, '3-way', $3, 'approve', 'clean', '1', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, $4, $5, $6, $7)`,
    [id, row.created, row.total ?? 10, row.status ?? "pending", row.decided ?? null, row.decided ? "Joan" : null, row.exported ?? null],
  );
}

describe("listForSummary", () => {
  it("places events on the business day in its time zone and leaves out finished earlier days", async () => {
    // Nov 9 in New York runs from 05:00Z on Nov 9 to 05:00Z on Nov 10.
    await insert("late-evening", { created: "2026-11-10T03:00:00Z" }); // 10pm Nov 9 New York
    await insert("too-early", { created: "2026-11-09T04:00:00Z", status: "rejected", decided: "2026-11-09T04:30:00Z" }); // Nov 8 evening
    await insert("old-pending", { created: "2026-11-01T15:00:00Z" });
    await insert("old-ready", { created: "2026-11-01T15:00:00Z", status: "approved", decided: "2026-11-02T15:00:00Z" });
    await insert("old-done", { created: "2026-11-01T15:00:00Z", status: "approved", decided: "2026-11-02T15:00:00Z", exported: "2026-11-03T15:00:00Z" });
    await insert("exported-today", { created: "2026-11-01T15:00:00Z", status: "approved", decided: "2026-11-02T15:00:00Z", exported: "2026-11-09T15:00:00Z" });

    const rows = await listForSummary(db, "2026-11-09", "America/New_York");
    const flags = rows.map((r) => [r.cameIn, r.decidedToday, r.exportedToday, r.status]).sort();
    expect(rows).toHaveLength(4);
    expect(flags).toEqual(
      [
        [true, false, false, "pending"],
        [false, false, false, "pending"],
        [false, false, false, "approved"],
        [false, false, true, "approved"],
      ].sort(),
    );
  });

  it("has no row limit", async () => {
    for (let i = 0; i < 205; i++) await insert(`s${i}`, { created: new Date().toISOString() });
    expect(await listForSummary(db, todayIn("UTC"), "UTC")).toHaveLength(205);
  });
});

describe("todayIn", () => {
  it("uses the time zone's calendar date", () => {
    expect(todayIn("America/New_York", new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-09");
    expect(todayIn("UTC", new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-10");
  });
});
