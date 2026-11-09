/**
 * The "View invoice / View PO / View receiving report" links on a queue row.
 * A link is offered only for a document that has a stored file: documents
 * uploaded before files were kept have none, and the file route returns 404.
 * Plain relative imports so Vitest can load this without the @/ alias.
 */

export interface SetDocument {
  id: string;
  type: string;
  hasFile: boolean;
}

export interface DocumentLink {
  href: string;
  label: string;
}

const LABELS: Record<string, string> = {
  invoice: "View invoice",
  purchase_order: "View PO",
  receiving_report: "View receiving report",
};
const ORDER = ["invoice", "purchase_order", "receiving_report"];

/** Links in a steady order (invoice, PO, receiving report), skipping documents with no stored file. */
export function documentLinks(documents: SetDocument[]): DocumentLink[] {
  return documents
    .filter((d) => d.hasFile && LABELS[d.type])
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map((d) => ({ href: `/api/documents/${encodeURIComponent(d.id)}`, label: LABELS[d.type]! }));
}
