/**
 * The end-of-day numbers for an AP specialist or their manager: what came in,
 * what the engine recommended, what people decided, where they went against the
 * engine and why, and what has been handed on. Pure, so it is easy to test.
 */

export interface SummarySet {
  status: "pending" | "approved" | "rejected";
  decision: { recommendation: "approve" | "review" | "reject" };
  decidedBy: string | null;
  overridden: boolean;
  overrideReason: string | null;
  exportedAt: Date | null;
  invoiceTotal: number | null;
}

export interface Summary {
  total: number;
  recommended: { approve: number; review: number; reject: number };
  pending: number;
  approved: number;
  rejected: number;
  /** Approved sets already handed to the ERP export. */
  exported: number;
  /** Approved sets not yet exported. */
  readyToExport: number;
  /** Decisions that followed the engine's recommendation. */
  followed: number;
  /** Decisions that went against it. */
  overridden: number;
  /** Share of decisions that were overrides, 0 to 1. Null before any decision. */
  overrideRate: number | null;
  /** Why people overrode, most common first. */
  overrideReasons: { reason: string; count: number }[];
  /** Invoice totals in dollars. Sets whose total could not be read are left out and counted in totalUnreadable. */
  dollars: { approved: number; rejected: number; pending: number };
  totalUnreadable: number;
  /** Decisions per person, most active first. */
  byPerson: { person: string; approved: number; rejected: number }[];
}

/** The reason code is the text before the first colon; a note-only reason is grouped under its own words. */
export function reasonLabel(reason: string | null): string {
  const text = (reason ?? "").trim();
  if (!text) return "No reason given";
  const head = text.split(":")[0]!.trim();
  return head.length > 0 && head.length <= 80 ? head : "Other";
}

const cents = (n: number) => Math.round(n * 100);

export function summarize(sets: SummarySet[]): Summary {
  const recommended = { approve: 0, review: 0, reject: 0 };
  let pending = 0, approved = 0, rejected = 0, exported = 0, readyToExport = 0, overridden = 0, unreadable = 0;
  const dollarCents = { approved: 0, rejected: 0, pending: 0 };
  const reasons = new Map<string, number>();
  const people = new Map<string, { approved: number; rejected: number }>();

  for (const s of sets) {
    recommended[s.decision.recommendation]++;
    if (s.invoiceTotal === null || !Number.isFinite(s.invoiceTotal)) unreadable++;
    else dollarCents[s.status] += cents(s.invoiceTotal);

    if (s.status === "pending") {
      pending++;
      continue;
    }
    if (s.status === "approved") {
      approved++;
      if (s.exportedAt) exported++;
      else readyToExport++;
    } else rejected++;

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
    total: sets.length,
    recommended,
    pending,
    approved,
    rejected,
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
