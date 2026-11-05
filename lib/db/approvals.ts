/**
 * Story 5: approve every clean set in one click, then export approved sets for
 * the ERP. Only sets the engine recommended approving, with no uncertain reads,
 * are approved in bulk; everything else still needs a person to open it.
 */
import type { Db } from "./db";
import { recordDecision, SetAlreadyDecidedError } from "./sets";

/** Pending sets the engine called clean: recommendation approve, reason clean, nothing gated. */
export async function listCleanPending(db: Db): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `select id from invoice_sets
     where status = 'pending' and recommendation = 'approve' and decision_reason = 'clean'
       and (decision ->> 'gated')::boolean is not true
     order by created_at`,
  );
  return rows.map((r) => r.id);
}

/** Approves each clean pending set as the named reviewer. A set someone decided meanwhile is skipped. */
export async function approveAllClean(db: Db, actor: string): Promise<{ approved: string[]; skipped: string[] }> {
  const approved: string[] = [];
  const skipped: string[] = [];
  for (const setId of await listCleanPending(db)) {
    try {
      await recordDecision(db, { setId, action: "approve", actor, bulk: true });
      approved.push(setId);
    } catch (err) {
      if (err instanceof SetAlreadyDecidedError) skipped.push(setId);
      else throw err;
    }
  }
  return { approved, skipped };
}

export interface ExportRow {
  setId: string;
  vendor: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  poNumber: string | null;
  invoiceTotal: string | null;
  approvedBy: string;
  approvedAt: Date;
  overridden: boolean;
  overrideReason: string | null;
}

export async function countReadyToExport(db: Db): Promise<number> {
  const [row] = await db.query<{ n: number | string }>(
    "select count(*) n from invoice_sets where status = 'approved' and exported_at is null",
  );
  return Number(row?.n ?? 0);
}

/**
 * Takes every approved set not yet exported, marks it exported and logs it, in
 * one transaction, so a set is handed to the ERP once.
 */
export async function exportApproved(db: Db, actor: string): Promise<ExportRow[]> {
  const who = actor.trim();
  if (!who) throw new Error("Enter your name so the export can be traced to a person.");
  return db.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string;
      invoice_vendor: string | null;
      invoice_number: string | null;
      invoice_date: string | null;
      po_number: string | null;
      invoice_total: string | number | null;
      decided_by: string;
      decided_at: Date;
      overridden: boolean;
      override_reason: string | null;
    }>(
      `select id, invoice_vendor, invoice_number, invoice_date, po_number, invoice_total, decided_by, decided_at, overridden, override_reason
       from invoice_sets where status = 'approved' and exported_at is null
       order by decided_at, id
       for update`,
    );
    for (const r of rows) {
      await tx.query("update invoice_sets set exported_at = now() where id = $1", [r.id]);
      await tx.query("insert into audit_log (set_id, actor, action, detail) values ($1, $2, 'exported', $3::jsonb)", [
        r.id,
        who,
        { format: "csv", rows: rows.length },
      ]);
    }
    return rows.map((r) => ({
      setId: r.id,
      vendor: r.invoice_vendor,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      poNumber: r.po_number,
      invoiceTotal: r.invoice_total === null ? null : Number(r.invoice_total).toFixed(2),
      approvedBy: r.decided_by,
      approvedAt: new Date(r.decided_at),
      overridden: r.overridden,
      overrideReason: r.override_reason,
    }));
  });
}
