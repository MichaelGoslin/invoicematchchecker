/** POST /api/batches/:id/match: group the batch's documents into sets, then run and save each set. Once per batch. */
import { BatchAlreadyMatchedError, BatchNotFoundError, matchBatch } from "@/lib/db/batches";
import { jsonError, requireDb } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = requireDb();
  if (db instanceof Response) return db;
  const { id } = await params;
  try {
    const out = await matchBatch(db, id);
    return Response.json({
      batchId: out.batchId,
      sets: out.sets.map((s) => ({
        setId: s.setId,
        invoiceFile: s.invoiceFile,
        invoiceNumber: s.invoiceNumber,
        recommendation: s.decision.recommendation,
        reason: s.decision.reason,
        summary: s.decision.summary,
      })),
      setAside: out.setAside,
    });
  } catch (err) {
    if (err instanceof BatchNotFoundError) return jsonError(err.message, 404);
    if (err instanceof BatchAlreadyMatchedError) return jsonError(err.message, 409);
    console.error("batch match failed", err);
    return jsonError("Matching the batch failed. Review its sets in the queue before retrying.", 500);
  }
}
