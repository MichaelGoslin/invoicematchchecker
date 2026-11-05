/**
 * POST /api/match: one invoice set in, one recommendation out.
 *
 * multipart/form-data fields:
 *   purchaseOrder    (required)  PDF, PNG, JPEG or .txt
 *   receivingReport  (optional)  same; leave out for a 2-way match
 *   invoice          (required)  same
 *   setId            (optional)  defaults to a generated id
 *
 * Responds with the extracted documents (minus file bytes), every trace and the
 * set decision. Nothing is stored yet, so the duplicate check needs review.
 */
import { randomUUID } from "node:crypto";
import { type DocumentMediaType, ExtractionError, extractDocument } from "@/lib/extract/extract";
import { SetAssemblyError, toMatchInput } from "@/lib/extract/toMatchInput";
import { runSet } from "@/lib/match/runSet";

export const runtime = "nodejs";
// Three documents are read in parallel; each read can take tens of seconds.
export const maxDuration = 300;

const MAX_BYTES = 20 * 1024 * 1024;
const MEDIA_TYPES: Record<string, DocumentMediaType> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "text/plain": "text/plain",
};

type Slot = "purchaseOrder" | "receivingReport" | "invoice";

const badRequest = (error: string, status = 400) => Response.json({ error }, { status });

async function readSlot(form: FormData, slot: Slot) {
  const file = form.get(slot);
  if (file === null) return null;
  if (!(file instanceof File)) throw new SetAssemblyError(`${slot} must be a file.`);
  const mediaType = MEDIA_TYPES[file.type] ?? (file.name.endsWith(".txt") ? "text/plain" : undefined);
  if (!mediaType) throw new SetAssemblyError(`${file.name} is ${file.type || "an unknown type"}; upload a PDF, PNG, JPEG or .txt file.`);
  if (file.size === 0) throw new SetAssemblyError(`${file.name} is empty.`);
  if (file.size > MAX_BYTES) throw new SetAssemblyError(`${file.name} is over 20 MB.`);
  return { name: file.name, mediaType, data: Buffer.from(await file.arrayBuffer()) };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Send the documents as multipart/form-data.");
  }

  try {
    const [po, rr, inv] = await Promise.all((["purchaseOrder", "receivingReport", "invoice"] as const).map((s) => readSlot(form, s)));
    if (!po || !inv) return badRequest("A purchase order and an invoice are required.");

    const [purchaseOrder, receivingReport, invoice] = await Promise.all([
      extractDocument(po),
      rr ? extractDocument(rr) : Promise.resolve(undefined),
      extractDocument(inv),
    ]);

    const setId = String(form.get("setId") ?? "") || `S-${randomUUID().slice(0, 8)}`;
    // No processed-invoice history until the database lands: null makes the duplicate check need review.
    const input = toMatchInput(setId, { purchaseOrder, invoice, ...(receivingReport ? { receivingReport } : {}) }, null);
    const { traces, decision } = runSet(input);

    const documents = [purchaseOrder, receivingReport, invoice]
      .filter((d) => d !== undefined)
      .map(({ name, document, guardNotes, model, promptVersion, usage }) => ({ name, document, guardNotes, model, promptVersion, usage }));

    return Response.json({ setId, decision, traces, documents });
  } catch (err) {
    if (err instanceof SetAssemblyError) return badRequest(err.message, 422);
    if (err instanceof ExtractionError) {
      // The set can't be read, so it goes to a person: say which document and why.
      return Response.json({ error: err.message, reason: err.reason, document: err.documentName }, { status: 422 });
    }
    console.error("match failed", err);
    return badRequest("Matching failed. Try again, or review this set by hand.", 500);
  }
}
