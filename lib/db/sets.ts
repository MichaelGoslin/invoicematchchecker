/**
 * Stores invoice sets, their recommendation and every human action. The engine
 * recommends; a person approves or rejects, and the audit log records who and why.
 */
import { compareForQueue, type Recommendation, type SetDecision } from "../match/decision";
import type { PriorInvoice } from "../match/duplicate";
import { type MatchSetInput, runSet } from "../match/runSet";
import { normalizeInvoiceNumber, normalizeName } from "../match/shared";
import type { TraceEntry } from "../match/types";
import type { Db } from "./db";

export type SetStatus = "pending" | "approved" | "rejected";
export type HumanAction = "approve" | "reject";

export interface StoredSet {
  id: string;
  createdAt: Date;
  matchType: "3-way" | "2-way";
  invoiceVendor: string | null;
  invoiceNumber: string | null;
  invoiceTotal: number | null;
  decision: SetDecision;
  traces: TraceEntry[];
  documents: unknown;
  status: SetStatus;
  decidedAt: Date | null;
  decidedBy: string | null;
  overridden: boolean;
  overrideReason: string | null;
}

export interface AuditEntry {
  at: Date;
  actor: string;
  action: "recommended" | "approved" | "rejected" | "exported";
  detail: Record<string, unknown>;
}

export class SetNotFoundError extends Error {}
export class SetAlreadyDecidedError extends Error {}
export class ReasonRequiredError extends Error {}

const dateText = (d: Date) => d.toISOString().slice(0, 10);

/** Every invoice already stored except rejected ones: a resubmission while the first is pending is still a duplicate. */
export async function loadPriors(db: Db): Promise<PriorInvoice[]> {
  const rows = await db.query<{ set_id: string; vendor: string; invoice_number: string; status: SetStatus; recorded_at: Date }>(
    "select set_id, vendor, invoice_number, status, recorded_at from processed_invoices where status <> 'rejected' order by recorded_at",
  );
  return rows.map((r) => ({
    vendor: r.vendor,
    invoiceNumber: r.invoice_number,
    ref: `set ${r.set_id}, ${r.status === "approved" ? "approved" : "pending review"} ${dateText(new Date(r.recorded_at))}`,
  }));
}

export interface SaveSetInput {
  /** Builds the engine input once the duplicate history is known. */
  build: (priors: PriorInvoice[]) => MatchSetInput;
  invoiceVendor: string | null;
  invoiceNumber: string | null;
  invoiceTotal: number | null;
  documents: unknown;
}

/**
 * Runs the rules and stores the result in one transaction. A lock on the
 * vendor and invoice number means two uploads of the same invoice can't both
 * pass the duplicate check.
 */
export async function matchAndSave(db: Db, input: SaveSetInput): Promise<{ decision: SetDecision; traces: TraceEntry[]; setId: string }> {
  return db.transaction(async (tx) => {
    const vendorKey = input.invoiceVendor ? normalizeName(input.invoiceVendor) : "";
    const numberKey = input.invoiceNumber ? normalizeInvoiceNumber(input.invoiceNumber) : "";
    if (vendorKey && numberKey) {
      await tx.query("select pg_advisory_xact_lock(hashtext($1))", [`${vendorKey}|${numberKey}`]);
    }

    const matchInput = input.build(await loadPriors(tx));
    const { traces, decision } = runSet(matchInput);

    await tx.query(
      `insert into invoice_sets (id, match_type, invoice_vendor, invoice_number, invoice_total, recommendation,
         decision_reason, decision_version, decision, traces, documents)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)`,
      [
        matchInput.setId,
        matchInput.matchType ?? "3-way",
        input.invoiceVendor,
        input.invoiceNumber,
        input.invoiceTotal,
        decision.recommendation,
        decision.reason,
        decision.decisionVersion,
        decision,
        traces,
        input.documents ?? null,
      ],
    );
    if (vendorKey && numberKey) {
      await tx.query(
        `insert into processed_invoices (set_id, vendor, invoice_number, vendor_key, invoice_number_key, status)
         values ($1, $2, $3, $4, $5, 'pending')`,
        [matchInput.setId, input.invoiceVendor, input.invoiceNumber, vendorKey, numberKey],
      );
    }
    await tx.query("insert into audit_log (set_id, actor, action, detail) values ($1, 'engine', 'recommended', $2::jsonb)", [
      matchInput.setId,
      ({
        recommendation: decision.recommendation,
        reason: decision.reason,
        decisionVersion: decision.decisionVersion,
        summary: decision.summary,
      }),
    ]);
    return { decision, traces, setId: matchInput.setId };
  });
}

interface SetRow {
  id: string;
  created_at: Date;
  match_type: "3-way" | "2-way";
  invoice_vendor: string | null;
  invoice_number: string | null;
  invoice_total: string | number | null;
  decision: SetDecision | string;
  traces: TraceEntry[] | string;
  documents: unknown;
  status: SetStatus;
  decided_at: Date | null;
  decided_by: string | null;
  overridden: boolean;
  override_reason: string | null;
}

const json = <T>(v: T | string): T => (typeof v === "string" ? (JSON.parse(v) as T) : v);

const toStored = (r: SetRow): StoredSet => ({
  id: r.id,
  createdAt: new Date(r.created_at),
  matchType: r.match_type,
  invoiceVendor: r.invoice_vendor,
  invoiceNumber: r.invoice_number,
  invoiceTotal: r.invoice_total === null ? null : Number(r.invoice_total),
  decision: json(r.decision),
  traces: json(r.traces),
  documents: json(r.documents as string),
  status: r.status,
  decidedAt: r.decided_at ? new Date(r.decided_at) : null,
  decidedBy: r.decided_by,
  overridden: r.overridden,
  overrideReason: r.override_reason,
});

/** Pending sets in queue order (rejects, gated, exceptions, incomplete, clean), then decided sets, newest first. */
export async function listQueue(db: Db, limit = 200): Promise<StoredSet[]> {
  const rows = await db.query<SetRow>("select * from invoice_sets order by created_at desc limit $1", [limit]);
  const sets = rows.map(toStored);
  const pending = sets.filter((s) => s.status === "pending").sort((a, b) => compareForQueue(a.decision, b.decision));
  return [...pending, ...sets.filter((s) => s.status !== "pending")];
}

export async function getSet(db: Db, id: string): Promise<{ set: StoredSet; audit: AuditEntry[] } | null> {
  const [row] = await db.query<SetRow>("select * from invoice_sets where id = $1", [id]);
  if (!row) return null;
  const audit = await db.query<{ at: Date; actor: string; action: AuditEntry["action"]; detail: Record<string, unknown> | string }>(
    "select at, actor, action, detail from audit_log where set_id = $1 order by at, id",
    [id],
  );
  return { set: toStored(row), audit: audit.map((a) => ({ ...a, at: new Date(a.at), detail: json(a.detail) })) };
}

/**
 * An action overrides the engine when it approves a set the engine did not
 * recommend approving, or rejects one it did. Overrides need a written reason.
 */
export const isOverride = (action: HumanAction, recommendation: Recommendation) =>
  action === "approve" ? recommendation !== "approve" : recommendation === "approve";

export async function recordDecision(
  db: Db,
  args: { setId: string; action: HumanAction; actor: string; reason?: string | null },
): Promise<StoredSet> {
  const actor = args.actor.trim();
  const reason = args.reason?.trim() || null;
  if (!actor) throw new ReasonRequiredError("Enter your name so the decision can be traced to a person.");

  return db.transaction(async (tx) => {
    const [row] = await tx.query<SetRow>("select * from invoice_sets where id = $1 for update", [args.setId]);
    if (!row) throw new SetNotFoundError(`Set ${args.setId} was not found.`);
    if (row.status !== "pending") throw new SetAlreadyDecidedError(`Set ${args.setId} was already ${row.status} by ${row.decided_by}.`);

    const recommendation = json(row.decision).recommendation;
    const overridden = isOverride(args.action, recommendation);
    if (overridden && !reason) {
      throw new ReasonRequiredError(
        `The engine recommended ${recommendation === "review" ? "review" : recommendation}; give a reason to ${args.action} this set.`,
      );
    }

    const status: SetStatus = args.action === "approve" ? "approved" : "rejected";
    const [updated] = await tx.query<SetRow>(
      `update invoice_sets set status = $2, decided_at = now(), decided_by = $3, overridden = $4, override_reason = $5
       where id = $1 returning *`,
      [args.setId, status, actor, overridden, overridden ? reason : null],
    );
    await tx.query("update processed_invoices set status = $2 where set_id = $1", [args.setId, status]);
    await tx.query("insert into audit_log (set_id, actor, action, detail) values ($1, $2, $3, $4::jsonb)", [
      args.setId,
      actor,
      status,
      { recommendation, overridden, reason },
    ]);
    return toStored(updated!);
  });
}
