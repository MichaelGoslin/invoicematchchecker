/**
 * POST /api/batches/:id/documents  (multipart: file)
 *
 * Reads one file with Claude and stores what was read in the batch. One file
 * per request keeps each request well inside the function time limit; the
 * page sends several at once.
 */
import { BatchAlreadyMatchedError, BatchNotFoundError, saveDocument } from "@/lib/db/batches";
import { ExtractionError, extractDocument } from "@/lib/extract/extract";
import { jsonError, requireDb } from "@/lib/api";
import { readUpload, UploadError } from "@/lib/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = requireDb();
  if (db instanceof Response) return db;
  const { id: batchId } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Send the file as multipart/form-data.", 400);
  }

  try {
    const input = await readUpload(form.get("file"), "file");
    if (!input) return jsonError("A file is required.", 400);
    const extraction = await extractDocument(input);
    const documentId = await saveDocument(db, batchId, extraction);
    const d = extraction.document;
    return Response.json(
      {
        documentId,
        fileName: extraction.name,
        documentType: d.document_type,
        documentTypeConfidence: d.document_type_confidence,
        documentNumber: d.document_number.value,
        poReference: d.po_reference.value,
        notes: [...d.reading_problems, ...extraction.guardNotes],
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message, 422);
    if (err instanceof BatchNotFoundError) return jsonError(err.message, 404);
    if (err instanceof BatchAlreadyMatchedError) return jsonError(err.message, 409);
    if (err instanceof ExtractionError) return jsonError(err.message, 422, { reason: err.reason, document: err.documentName });
    console.error("document upload failed", err);
    return jsonError("This file couldn't be read. Try again, or review it by hand.", 500);
  }
}
