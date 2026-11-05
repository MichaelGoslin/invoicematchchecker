/**
 * Batch upload (story 1): documents are read one by one into a batch, then the
 * whole batch is grouped into sets and each set is matched and saved.
 */
import { randomUUID } from "node:crypto";
import { type BatchDocument, groupBatch, type SetAside } from "../batch/group";
import type { ExtractionResult } from "../extract/extract";
import { toMatchInput } from "../extract/toMatchInput";
import type { SetDecision } from "../match/decision";
import type { Db } from "./db";
import { matchAndSave } from "./sets";

export class BatchNotFoundError extends Error {}
export class BatchAlreadyMatchedError extends Error {}

export const newBatchId = () => `B-${randomUUID().slice(0, 8)}`;
export const newDocumentId = () => `D-${randomUUID().slice(0, 12)}`;
export const newSetId = () => `S-${randomUUID().slice(0, 8)}`;

export async function createBatch(db: Db, id = newBatchId()): Promise<string> {
  await db.query("insert into batches (id) values ($1)", [id]);
  return id;
}

async function openBatch(db: Db, batchId: string) {
  const [batch] = await db.query<{ matched_at: Date | null }>("select matched_at from batches where id = $1", [batchId]);
  if (!batch) throw new BatchNotFoundError(`Batch ${batchId} was not found.`);
  if (batch.matched_at) throw new BatchAlreadyMatchedError(`Batch ${batchId} was already matched; start a new batch.`);
}

export async function saveDocument(db: Db, batchId: string, extraction: ExtractionResult, id = newDocumentId()): Promise<string> {
  await openBatch(db, batchId);
  await db.query(
    "insert into documents (id, batch_id, file_name, document_type, extraction) values ($1, $2, $3, $4, $5::jsonb)",
    [id, batchId, extraction.name, extraction.document.document_type, extraction],
  );
  return id;
}

export interface MatchedBatchSet {
  setId: string;
  invoiceFile: string;
  invoiceNumber: string | null;
  decision: SetDecision;
}

export interface MatchedBatch {
  batchId: string;
  sets: MatchedBatchSet[];
  setAside: SetAside[];
}

/**
 * Groups every document in the batch into sets, then runs and saves each set.
 * A batch is matched once: claiming it first means two clicks can't create
 * the same sets twice.
 */
export async function matchBatch(db: Db, batchId: string): Promise<MatchedBatch> {
  const claimed = await db.query("update batches set matched_at = now() where id = $1 and matched_at is null returning id", [batchId]);
  if (claimed.length === 0) {
    const [exists] = await db.query("select 1 from batches where id = $1", [batchId]);
    throw exists ? new BatchAlreadyMatchedError(`Batch ${batchId} was already matched.`) : new BatchNotFoundError(`Batch ${batchId} was not found.`);
  }

  const rows = await db.query<{ id: string; extraction: ExtractionResult | string }>(
    "select id, extraction from documents where batch_id = $1 order by created_at, id",
    [batchId],
  );
  const docs: BatchDocument[] = rows.map((r) => ({
    id: r.id,
    extraction: typeof r.extraction === "string" ? (JSON.parse(r.extraction) as ExtractionResult) : r.extraction,
  }));

  const { sets, setAside } = groupBatch(docs);
  await db.query("update batches set set_aside = $2::jsonb where id = $1", [batchId, setAside]);

  const results: MatchedBatchSet[] = [];
  for (const group of sets) {
    const setId = newSetId();
    const inv = group.documents.invoice.document;
    const { decision } = await matchAndSave(db, {
      build: (priors) => toMatchInput(setId, group.documents, priors),
      invoiceVendor: inv.vendor.value,
      invoiceNumber: inv.document_number.value,
      invoiceTotal: inv.total.value,
      invoiceDate: inv.document_date.value,
      poNumber: group.documents.purchaseOrder?.document.document_number.value ?? inv.po_reference.value,
      batchId,
      documentIds: group.documentIds,
      documents: Object.values(group.documents).map(({ name, document, guardNotes, model, promptVersion, usage }) => ({
        name,
        document,
        guardNotes,
        model,
        promptVersion,
        usage,
      })),
    });
    results.push({ setId, invoiceFile: group.documents.invoice.name, invoiceNumber: inv.document_number.value, decision });
  }
  return { batchId, sets: results, setAside };
}
