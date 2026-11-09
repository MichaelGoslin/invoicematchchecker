/**
 * Plain-words hints for the queue's bulk actions bar: what each button will do,
 * and, when a button is off, why. A disabled button with no explanation looks
 * broken, so every disabled state has a reason.
 */

import { isAgainstRecommendation } from "./overrideReasons";

const plural =(n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function approveLabel(cleanCount: number): string {
  return cleanCount === 0 ? "Approve all clean" : `Approve all ${cleanCount} clean`;
}

export function exportLabel(exportCount: number): string {
  return exportCount === 0 ? "Export approved" : `Export ${exportCount} approved`;
}

/** Why "approve all clean" is off, or null when it can be used. */
export function approveBlockedReason(cleanCount: number, name: string): string | null {
  if (cleanCount === 0) return "No clean sets are waiting.";
  if (!name.trim()) return "Enter your name at the top of the queue first. It is saved with every decision.";
  return null;
}

/** Why "export" is off, or null when it can be used. */
export function exportBlockedReason(exportCount: number, name: string): string | null {
  if (exportCount === 0) return "Nothing approved is waiting to be exported.";
  if (!name.trim()) return "Enter your name at the top of the queue first. It is saved in the audit log.";
  return null;
}

/** One sentence on what is ready, for the top of the bar. */
export function readyLine(cleanCount: number, exportCount: number): string {
  return `${plural(cleanCount, "clean set")} ready to approve · ${plural(exportCount, "approved set")} ready to export`;
}

/** The result line after approving: how many went through, and how many were skipped because someone got there first. */
export function approvedMessage(approved: number, skipped = 0): string {
  const done = `Approved ${plural(approved, "clean set")}.`;
  return skipped > 0 ? `${done} ${plural(skipped, "set")} had already been decided by someone else and ${skipped === 1 ? "was" : "were"} left alone.` : done;
}

/**
 * Why a row's Approve or Reject is off, or null when it can be used. Said in
 * words because a greyed-out button alone reads as "the page is broken".
 */
export function decisionBlockedReason(
  action: "approve" | "reject",
  recommendation: "approve" | "review" | "reject",
  name: string,
  reason: string,
): string | null {
  if (!name.trim()) return "Enter your name in the Your name box at the top of the queue first.";
  if (isAgainstRecommendation(action, recommendation) && !reason.trim()) {
    return `The engine recommended ${recommendation}, so choose a reason code or write a note to ${action} it.`;
  }
  return null;
}
