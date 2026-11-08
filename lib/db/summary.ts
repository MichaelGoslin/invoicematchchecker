/**
 * The rows behind the daily summary: every set that came in, was decided or was
 * exported on the day, plus everything still waiting or not yet exported. Only
 * the columns the summary needs, with no row limit, so the counts are complete.
 */
import type { SummarySet } from "../summary/summarize";
import type { Db } from "./db";

/** The business day's time zone. Set SUMMARY_TIME_ZONE to an IANA name to change it. */
export const summaryTimeZone = () => process.env.SUMMARY_TIME_ZONE?.trim() || "America/New_York";

/** Today's date (YYYY-MM-DD) in the given time zone. */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export async function listForSummary(db: Db, day: string, timeZone: string): Promise<SummarySet[]> {
  const rows = await db.query<{
    status: SummarySet["status"];
    recommendation: SummarySet["recommendation"];
    decided_by: string | null;
    overridden: boolean;
    override_reason: string | null;
    exported: boolean;
    invoice_total: string | number | null;
    came_in: boolean;
    decided_today: boolean;
    exported_today: boolean;
  }>(
    `with day as (
       select ($1::date)::timestamp at time zone $2 as starts,
              ($1::date + 1)::timestamp at time zone $2 as ends
     )
     select s.status, s.recommendation, s.decided_by, s.overridden, s.override_reason,
            s.exported_at is not null as exported, s.invoice_total,
            coalesce(s.created_at >= day.starts and s.created_at < day.ends, false) as came_in,
            coalesce(s.decided_at >= day.starts and s.decided_at < day.ends, false) as decided_today,
            coalesce(s.exported_at >= day.starts and s.exported_at < day.ends, false) as exported_today
     from invoice_sets s, day
     where s.status = 'pending'
        or (s.status = 'approved' and s.exported_at is null)
        or (s.created_at >= day.starts and s.created_at < day.ends)
        or (s.decided_at >= day.starts and s.decided_at < day.ends)
        or (s.exported_at >= day.starts and s.exported_at < day.ends)`,
    [day, timeZone],
  );
  return rows.map((r) => ({
    status: r.status,
    recommendation: r.recommendation,
    decidedBy: r.decided_by,
    overridden: r.overridden,
    overrideReason: r.override_reason,
    exported: r.exported,
    invoiceTotal: r.invoice_total === null ? null : Number(r.invoice_total),
    cameIn: r.came_in,
    decidedToday: r.decided_today,
    exportedToday: r.exported_today,
  }));
}
