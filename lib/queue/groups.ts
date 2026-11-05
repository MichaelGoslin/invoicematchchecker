/**
 * Groups the review queue by why the engine put each set where it did, in the
 * order a specialist should work them. Pure functions, so the page stays thin.
 */
import { compareForQueue, type DecisionReason, type SetDecision } from "../match/decision";

export interface QueueGroup<T> {
  reason: DecisionReason;
  title: string;
  /** One line telling the reviewer what this group means. */
  blurb: string;
  items: T[];
}

const GROUPS: { reason: DecisionReason; title: string; blurb: string }[] = [
  { reason: "reject", title: "Recommend reject", blurb: "A check failed that should stop payment, such as a duplicate invoice, the wrong vendor or no PO." },
  { reason: "gated", title: "Uncertain readings", blurb: "A value was read with low confidence, so a person must confirm it. Never recommended for approval." },
  { reason: "exception", title: "Exceptions", blurb: "The readings were trusted, but a check failed: price, quantity, totals or PO number." },
  { reason: "incomplete", title: "Incomplete", blurb: "A required check could not run, so the set can't be called clean." },
  { reason: "clean", title: "Clean", blurb: "Every required check ran and passed. These can be approved together." },
];

/** Non-empty groups in work order, each sorted the way the engine sorts the queue. */
export function groupByReason<T extends { decision: SetDecision }>(items: T[]): QueueGroup<T>[] {
  return GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => i.decision.reason === g.reason).sort((a, b) => compareForQueue(a.decision, b.decision)),
  })).filter((g) => g.items.length > 0);
}
