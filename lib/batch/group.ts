/**
 * Sorts a batch of extracted documents into invoice sets (story 1: upload the
 * morning batch at once). Each invoice becomes one set, joined to the PO and
 * receiving report that share its PO number. Anything that can't be placed
 * with confidence is set aside with a reason, never guessed.
 */
import type { ExtractionResult } from "../extract/extract";
import type { SetDocuments } from "../extract/toMatchInput";
import { DEFAULT_MIN_CONFIDENCE, normalizePoNumber } from "../match/shared";

export interface BatchDocument {
  id: string;
  extraction: ExtractionResult;
}

export interface GroupedSet {
  invoiceId: string;
  documentIds: string[];
  documents: SetDocuments;
}

export interface SetAside {
  documentId: string;
  fileName: string;
  reason: string;
}

export interface Grouping {
  sets: GroupedSet[];
  setAside: SetAside[];
}

const confident = (c: number) => c >= DEFAULT_MIN_CONFIDENCE;

/** Index documents by a PO key; a key shared by two documents is ambiguous and indexes neither. */
function indexByPo(docs: BatchDocument[], keyOf: (d: BatchDocument) => string | null) {
  const byKey = new Map<string, BatchDocument[]>();
  const unkeyed: BatchDocument[] = [];
  for (const d of docs) {
    const key = keyOf(d);
    if (!key) unkeyed.push(d);
    else byKey.set(key, [...(byKey.get(key) ?? []), d]);
  }
  const unique = new Map<string, BatchDocument>();
  const ambiguous: BatchDocument[][] = [];
  for (const [key, list] of byKey) {
    if (list.length === 1) unique.set(key, list[0]!);
    else ambiguous.push(list);
  }
  return { unique, ambiguous, unkeyed };
}

export function groupBatch(docs: BatchDocument[]): Grouping {
  const setAside: SetAside[] = [];
  const aside = (d: BatchDocument, reason: string) =>
    setAside.push({ documentId: d.id, fileName: d.extraction.name, reason });

  const byType = { purchase_order: [] as BatchDocument[], receiving_report: [] as BatchDocument[], invoice: [] as BatchDocument[] };
  for (const d of docs) {
    const doc = d.extraction.document;
    if (doc.document_type === "other") aside(d, "Not recognized as a purchase order, receiving report or invoice.");
    else if (!confident(doc.document_type_confidence)) {
      const kind = doc.document_type.replace("_", " ");
      aside(d, `Read as ${kind === "invoice" ? "an" : "a"} ${kind} at confidence ${doc.document_type_confidence.toFixed(2)}; a person needs to say what it is.`);
    } else byType[doc.document_type].push(d);
  }

  // A PO is keyed by its own number; a receiving report by the PO it cites. Only confident reads are used as keys.
  const poKey = (d: BatchDocument) => {
    const f = d.extraction.document.document_number;
    return f.value && confident(f.confidence) ? normalizePoNumber(f.value) || null : null;
  };
  const rrKey = (d: BatchDocument) => {
    const f = d.extraction.document.po_reference;
    return f.value && confident(f.confidence) ? normalizePoNumber(f.value) || null : null;
  };
  const pos = indexByPo(byType.purchase_order, poKey);
  const rrs = indexByPo(byType.receiving_report, rrKey);

  for (const d of pos.unkeyed) aside(d, "Its PO number couldn't be read with confidence, so no invoice can be matched to it.");
  for (const list of pos.ambiguous) for (const d of list) aside(d, `${list.length} purchase orders in this batch share the same PO number.`);
  for (const d of rrs.unkeyed) aside(d, "The PO number it cites couldn't be read with confidence, so it can't be matched.");
  for (const list of rrs.ambiguous) {
    for (const d of list) aside(d, `${list.length} receiving reports in this batch cite the same PO; split deliveries aren't combined yet.`);
  }

  const usedPos = new Set<string>();
  const usedRrs = new Set<string>();
  const sets: GroupedSet[] = byType.invoice.map((inv) => {
    const ref = inv.extraction.document.po_reference;
    // An uncertain reference attaches nothing; the PO check then gates the set for a person.
    const key = ref.value && confident(ref.confidence) ? normalizePoNumber(ref.value) : "";
    const po = key ? pos.unique.get(key) : undefined;
    const rr = key ? rrs.unique.get(key) : undefined;
    if (po) usedPos.add(po.id);
    if (rr) usedRrs.add(rr.id);
    return {
      invoiceId: inv.id,
      documentIds: [inv.id, ...(po ? [po.id] : []), ...(rr ? [rr.id] : [])],
      documents: {
        invoice: inv.extraction,
        ...(po ? { purchaseOrder: po.extraction } : {}),
        ...(rr ? { receivingReport: rr.extraction } : {}),
      },
    };
  });

  for (const d of pos.unique.values()) if (!usedPos.has(d.id)) aside(d, "No invoice in this batch cites this PO.");
  for (const d of rrs.unique.values()) if (!usedRrs.has(d.id)) aside(d, "No invoice in this batch cites the PO this receiving report is for.");

  return { sets, setAside };
}
