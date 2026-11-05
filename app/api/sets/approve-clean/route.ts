/**
 * POST /api/sets/approve-clean  { actor }
 * Approves every pending set the engine called clean (recommend approve, no
 * uncertain reads), as the named reviewer. Every other set still needs a person.
 */
import { approveAllClean } from "@/lib/db/approvals";
import { actorFrom, jsonError, readJson, requireDb } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const db = requireDb();
  if (db instanceof Response) return db;
  const body = await readJson<{ actor: string }>(request);
  const actor = actorFrom(body?.actor);
  if (!actor) return jsonError("Enter your name so the approvals can be traced to a person.", 422);
  return Response.json(await approveAllClean(db, actor));
}
