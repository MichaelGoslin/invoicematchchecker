/**
 * POST /api/sets/:id/decision  { action: "approve" | "reject", actor: string, reason?: string }
 *
 * A person's decision on one set. Going against the engine's recommendation is
 * an override and needs a reason. Every decision is written to the audit log.
 */
import { getDb } from "@/lib/db/client";
import { ReasonRequiredError, recordDecision, SetAlreadyDecidedError, SetNotFoundError } from "@/lib/db/sets";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  if (!db) return Response.json({ error: "No database is configured, so decisions can't be saved." }, { status: 503 });

  const { id } = await params;
  let body: { action?: unknown; actor?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON: { action, actor, reason }." }, { status: 400 });
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return Response.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
  }
  const actor = typeof body.actor === "string" ? body.actor.slice(0, 100) : "";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 2000) : null;

  try {
    const set = await recordDecision(db, { setId: id, action: body.action, actor, reason });
    return Response.json({ set: { id: set.id, status: set.status, decidedBy: set.decidedBy, overridden: set.overridden } });
  } catch (err) {
    if (err instanceof SetNotFoundError) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof SetAlreadyDecidedError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof ReasonRequiredError) return Response.json({ error: err.message }, { status: 422 });
    console.error("decision failed", err);
    return Response.json({ error: "The decision could not be saved. Try again." }, { status: 500 });
  }
}
