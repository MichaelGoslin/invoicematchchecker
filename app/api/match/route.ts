/**
 * POST /api/match: one invoice set in, one recommendation out.
 *
 * multipart/form-data fields:
 *   invoice          (required)  PDF, PNG, JPEG or .txt
 *   purchaseOrder    (optional)  same; without one the set is recommended for rejection
 *   receivingReport  (optional)  same; without one a 3-way match is incomplete
 *   matchType        (optional)  "3-way" (default) or "2-way" for purchases with nothing to receive
 *   setId            (optional)  defaults to a generated id
 *
 * Responds with the extracted documents (minus file bytes), every trace and the
 * set decision. With a database (POSTGRES_URL) the set, its recommendation and an
 * audit entry are saved, and stored invoices feed the duplicate check. Without one,
 * nothing is saved and the duplicate check needs review.
 */
import { randomUUID } from "node:crypto";
import { ExtractionError, extractDocument } from "@/lib/extract/extract";
import { SetAssemblyError, toMatchInput } from "@/lib/extract/toMatchInput";
import { getDb } from "@/lib/db/client";
import { matchAndSave } from "@/lib/db/sets";
import type { PriorInvoice } from "@/lib/match/duplicate";
import { runSet } from "@/lib/match/runSet";
import { readUpload, UploadError } from "@/lib/upload";

export const runtime = "nodejs";
// Three documents are read in parallel; each read can take tens of seconds.
export const maxDuration = 300;

const badRequest = (error: string, status = 400) => Response.json({ error }, { status });

const readSlot = (form: FormData, slot: "purchaseOrder" | "receivingReport" | "invoice") => readUpload(form.get(slot), slot);

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Send the documents as multipart/form-data.");
  }

  try {
    const [po, rr, inv] = await Promise.all((["purchaseOrder", "receivingReport", "invoice"] as const).map((s) => readSlot(form, s)));
    if (!inv) return badRequest("An invoice is required.");
    const matchType = String(form.get("matchType") ?? "3-way");
    if (matchType !== "3-way" && matchType !== "2-way") return badRequest('matchType must be "3-way" or "2-way".');

    const [purchaseOrder, receivingReport, invoice] = await Promise.all([
      po ? extractDocument(po) : Promise.resolve(undefined),
      rr ? extractDocument(rr) : Promise.resolve(undefined),
      extractDocument(inv),
    ]);

    const setId = String(form.get("setId") ?? "") || `S-${randomUUID().slice(0, 8)}`;
    const docs = { invoice, ...(purchaseOrder ? { purchaseOrder } : {}), ...(receivingReport ? { receivingReport } : {}) };
    const build = (priors: PriorInvoice[] | null) => toMatchInput(setId, docs, priors, { matchType });

    const documents = [purchaseOrder, receivingReport, invoice]
      .filter((d) => d !== undefined)
      .map(({ name, document, guardNotes, model, promptVersion, usage }) => ({ name, document, guardNotes, model, promptVersion, usage }));

    const db = getDb();
    if (!db) {
      // No database: nothing is saved, and null history makes the duplicate check need review.
      const { traces, decision } = runSet(build(null));
      return Response.json({ setId, saved: false, decision, traces, documents });
    }
    const { traces, decision } = await matchAndSave(db, {
      build,
      invoiceVendor: invoice.document.vendor.value,
      invoiceNumber: invoice.document.document_number.value,
      invoiceTotal: invoice.document.total.value,
      invoiceDate: invoice.document.document_date.value,
      poNumber: purchaseOrder?.document.document_number.value ?? invoice.document.po_reference.value,
      documents,
    });
    return Response.json({ setId, saved: true, decision, traces, documents });
  } catch (err) {
    if (err instanceof SetAssemblyError || err instanceof UploadError) return badRequest(err.message, 422);
    if ((err as { code?: string }).code === "23505") return badRequest("A set with that id already exists.", 409);
    if (err instanceof ExtractionError) {
      // The set can't be read, so it goes to a person: say which document and why.
      return Response.json({ error: err.message, reason: err.reason, document: err.documentName }, { status: 422 });
    }
    console.error("match failed", err);
    return badRequest("Matching failed. Try again, or review this set by hand.", 500);
  }
}
