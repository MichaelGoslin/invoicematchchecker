/**
 * POST /api/export  { actor }
 * Returns a CSV of every approved set not yet exported, for the ERP, and marks
 * those sets exported. Each set is exported once; the audit log records who did it.
 */
import { exportApproved } from "@/lib/db/approvals";
import { toCsv } from "@/lib/export/csv";
import { actorFrom, jsonError, readJson, requireDb } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const db = requireDb();
  if (db instanceof Response) return db;
  const body = await readJson<{ actor: string }>(request);
  const actor = actorFrom(body?.actor);
  if (!actor) return jsonError("Enter your name so the export can be traced to a person.", 422);

  const rows = await exportApproved(db, actor);
  if (rows.length === 0) return jsonError("Nothing to export: every approved set has already been exported.", 409);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="approved-invoices-${stamp}.csv"`,
      "x-export-count": String(rows.length),
    },
  });
}
