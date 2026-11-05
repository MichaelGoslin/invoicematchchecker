/**
 * POST /api/sets/:id/explanation
 * Returns the set's plain-English explanation, asking Claude for one the first
 * time. The explanation never changes the set's recommendation or status.
 */
import { explainSet } from "@/lib/explain/explain";
import { getSet, saveExplanation, SetNotFoundError } from "@/lib/db/sets";
import { jsonError, requireDb } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = requireDb();
  if (db instanceof Response) return db;
  const { id } = await params;

  try {
    const stored = await getSet(db, id);
    if (!stored) return jsonError(`Set ${id} was not found.`, 404);
    if (stored.set.explanation) return Response.json({ explanation: stored.set.explanation });

    const explanation = await explainSet(stored.set.decision, stored.set.traces);
    return Response.json({ explanation: await saveExplanation(db, id, explanation) });
  } catch (err) {
    if (err instanceof SetNotFoundError) return jsonError(err.message, 404);
    console.error("explanation failed", err);
    return jsonError("Couldn't get an explanation right now. The checks above show the full reasoning.", 502);
  }
}
