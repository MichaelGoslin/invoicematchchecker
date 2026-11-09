/**
 * Pure helpers for the batch upload screen: which files to accept, how far a
 * batch has got, and how to say it in plain words. No browser or server code,
 * so they are tested on their own.
 */

export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt";
const EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".txt"];
/** Keep in step with MAX_UPLOAD_BYTES in lib/upload.ts. */
export const MAX_BYTES = 20 * 1024 * 1024;

export interface PickedFile {
  name: string;
  size: number;
}

export interface Rejected {
  name: string;
  reason: string;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Adds newly picked files to those already chosen. Files the server would
 * refuse (wrong type, empty, over 20 MB) and exact repeats are turned away here
 * with a reason, so nobody waits for an upload that was never going to work.
 */
export function addFiles<T extends PickedFile>(existing: T[], incoming: T[]): { files: T[]; rejected: Rejected[] } {
  const files = [...existing];
  const rejected: Rejected[] = [];
  for (const f of incoming) {
    const ext = f.name.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? "";
    if (!EXTENSIONS.includes(ext)) rejected.push({ name: f.name, reason: "Use a PDF, PNG, JPEG or .txt file." });
    else if (f.size === 0) rejected.push({ name: f.name, reason: "The file is empty." });
    else if (f.size > MAX_BYTES) rejected.push({ name: f.name, reason: `Over 20 MB (${formatSize(f.size)}).` });
    else if (files.some((x) => x.name === f.name && x.size === f.size)) rejected.push({ name: f.name, reason: "Already added." });
    else files.push(f);
  }
  return { files, rejected };
}

export type ReadStatus = "waiting" | "reading" | "read" | "failed";

export function progress(statuses: ReadStatus[]): { total: number; finished: number; failed: number; percent: number } {
  const total = statuses.length;
  const failed = statuses.filter((s) => s === "failed").length;
  const finished = statuses.filter((s) => s === "read").length + failed;
  return { total, finished, failed, percent: total === 0 ? 0 : Math.round((finished / total) * 100) };
}

const TYPE_LABELS: Record<string, string> = {
  purchase_order: "Purchase order",
  receiving_report: "Receiving report",
  invoice: "Invoice",
};

/** "purchase_order" becomes "Purchase order"; anything unexpected is shown as "Other document". */
export const documentTypeLabel = (type: string | null | undefined) => (type && TYPE_LABELS[type]) || "Other document";

export function tally(sets: { recommendation: string }[]): { approve: number; review: number; reject: number } {
  const out = { approve: 0, review: 0, reject: 0 };
  for (const s of sets) if (s.recommendation === "approve" || s.recommendation === "review" || s.recommendation === "reject") out[s.recommendation]++;
  return out;
}
