/** POST /api/batches: start a batch. Upload its files to /api/batches/:id/documents, then match it. */
import { createBatch } from "@/lib/db/batches";
import { requireDb } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  const db = requireDb();
  if (db instanceof Response) return db;
  return Response.json({ batchId: await createBatch(db) }, { status: 201 });
}
