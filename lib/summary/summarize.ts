/**
 * The end-of-day numbers for an AP specialist or their manager: what came in
 * today, what people decided today, where they went against the engine and why,
 * and what is still waiting. Pure, so it is easy to test; the query decides which
 * day each set's events fall on (see lib/db/summary.ts).
 */
import { OVERRIDE_REASONS } from "../queue/overrideReasons";

export interface SummarySet {
  status: "pending" | "approved" | "rejected";
  recommendation: "approve" | "review" | "reject";
  decidedBy: string | null;
  overridden: boolean;
  overrideReason: string | null;
  /** Approved and handed to the ERP export (on any day). */
  exported: boolean;
  invoiceTotal: number | null;
  /** The set was checked on the summary day. */
  cameIn: boolean;
  /** A person approved or rejected it on the summary day. */
  decidedToday: boolean;
  /** It was exported on the summary day. */
  exportedToday: boolean;
}

export interface Summary {
  /** Sets checked on the day, by the engine's recommendation. */
  total: number;
  recommended: { approve: number; review: number; reject: number };
  /** Decisions made on the day. */
  approved: number;
  rejected: number;
  /** Sets still waiting for a person, whichever day they came in. */
  pending: number;
  /** Sets exported on the day. */
  exported: number;
  /** Approved sets not yet exported, whichever day they were approved. */
  readyToExport: number;
  /** The day's decisions that followed the engine's recommendation. */
  followed: number;
  /** The day's decisions that went against it. */
  overridden: number;
  /** Share of the day's decisions that were overrides, 0 to 1. Null before any decision. */
  overrideRate: number | null;
  /** Why people overrode, most common first. */
  overrideReasons: { reason: string; count: number }[];
  /**
   * Invoice totals in dollars: approved and rejected on the day, and everything
   * still waiting. Sets whose total could not be read are left out and counted in totalUnreadable.
   */
  dollars: { approved: number; rejected: number; pending: number };
  totalUnreadable: number;
  /** The day's decisions per person, most active first. */
  byPerson: { person: string; approved: number; rejected: number }[];
}

export const NO_REASON = "No reason given";
export const NOTE_ONLY = "Note only (no reason picked)";

/**
 * Groups an override by the reason code picked in the queue (stored as "<label>: <note>").
 * A reason without a known code is grouped as note-only, so free-text wording
 * doesn't split the table into one row per note.
 */
export function reasonLabel(reason: string | null): string {
  const text = (reason ?? "").trim();
  if (!text) return NO_REASON;
  const known = OVERRIDE_REASONS.find((r) => text === r.label || text.startsWith(`${r.label}:`));
  return known ? known.label : NOTE_ONLY;
}

const cents = (n: number) => Math.round(n * 100);

export function summarize(sets: SummarySet[]): Summary {
  const recommended = { approve: 0, review: 0, reject: 0 };
  let total = 0, pending = 0, approved = 0, rejected = 0, exported = 0, readyToExport = 0, overridden = 0, unreadable = 0;
  const dollarCents = { approved: 0, rejected: 0, pending: 0 };
  const reasons = new Map<string, number>();
  const people = new Map<string, { approved: number; rejected: number }>();

  for (const s of sets) {
    if (s.cameIn) {
      total++;
      recommended[s.recommendation]++;
    }
    if (s.exportedToday) exported++;
    if (s.status === "approved" && !s.exported) readyToExport++;

    const inDollars = s.status === "pending" || s.decidedToday;
    if (inDollars) {
      if (s.invoiceTotal === null || !Number.isFinite(s.invoiceTotal)) unreadable++;
      else dollarCents[s.status] += cents(s.invoiceTotal);
    }

    if (s.status === "pending") {
      pending++;
      continue;
    }
    if (!s.decidedToday) continue;

    if (s.status === "approved") approved++;
    else rejected++;

    if (s.overridden) {
      overridden++;
      const label = reasonLabel(s.overrideReason);
      reasons.set(label, (reasons.get(label) ?? 0) + 1);
    }
    const who = s.decidedBy?.trim() || "Unknown";
    const p = people.get(who) ?? { approved: 0, rejected: 0 };
    p[s.status]++;
    people.set(who, p);
  }

  const decided = approved + rejected;
  return {
    total,
    recommended,
    approved,
    rejected,
    pending,
    exported,
    readyToExport,
    followed: decided - overridden,
    overridden,
    overrideRate: decided === 0 ? null : overridden / decided,
    overrideReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    dollars: { approved: dollarCents.approved / 100, rejected: dollarCents.rejected / 100, pending: dollarCents.pending / 100 },
    totalUnreadable: unreadable,
    byPerson: [...people]
      .map(([person, v]) => ({ person, ...v }))
      .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected) || a.person.localeCompare(b.person)),
  };
}
