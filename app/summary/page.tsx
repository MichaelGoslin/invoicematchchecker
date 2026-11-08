import { getDb } from "@/lib/db/client";
import { listForSummary, summaryTimeZone, todayIn } from "@/lib/db/summary";
import { sampleSets } from "@/lib/match/fixtures";
import { summarize, type SummarySet } from "@/lib/summary/summarize";
import { Nav } from "../components/Nav";
import styles from "./summary.module.css";

// Reads live data on every request.
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

function Tile({ value, label, tone }: { value: string | number; label: string; tone?: "approve" | "review" | "reject" }) {
  return (
    <li className={`${styles.tile} ${tone ? styles[tone] : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </li>
  );
}

export default async function SummaryPage() {
  const db = getDb();
  const timeZone = summaryTimeZone();
  const day = todayIn(timeZone);
  let sets: SummarySet[];
  if (db) {
    sets = await listForSummary(db, day, timeZone);
  } else {
    // No database: show the built-in sample sets as a day where they all came in and nothing is decided yet.
    sets = sampleSets.map((s) => ({
      status: "pending",
      recommendation: s.decision.recommendation,
      decidedBy: null,
      overridden: false,
      overrideReason: null,
      exported: false,
      invoiceTotal: s.total,
      cameIn: true,
      decidedToday: false,
      exportedToday: false,
    }));
  }
  const dayText = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const s = summarize(sets);

  return (
    <main>
      <Nav current="/summary" />
      <h1>Daily summary</h1>
      <p className="muted">
        {db ? `${dayText} (${timeZone}).` : "No database is configured, so this uses the sample sets."} The tool recommends; a
        person approves every payment.
      </p>

      <h2>What came in today</h2>
      <ul className={styles.tiles} aria-label="What came in">
        <Tile value={s.total} label="Sets checked" />
        <Tile value={s.recommended.approve} label="Recommended approve" tone="approve" />
        <Tile value={s.recommended.review} label="Needs review" tone="review" />
        <Tile value={s.recommended.reject} label="Recommended reject" tone="reject" />
      </ul>

      <h2>What people decided today</h2>
      <ul className={styles.tiles} aria-label="What people decided">
        <Tile value={s.approved} label="Approved" tone="approve" />
        <Tile value={s.rejected} label="Rejected" tone="reject" />
        <Tile value={s.exported} label="Exported" />
      </ul>
      <h2>Still open</h2>
      <ul className={styles.tiles} aria-label="Still open">
        <Tile value={s.pending} label="Waiting for a person" tone="review" />
        <Tile value={s.readyToExport} label="Approved, not yet exported" />
      </ul>

      <h2>Where people went against the engine</h2>
      {s.approved + s.rejected === 0 ? (
        <p className="muted">No decisions yet.</p>
      ) : (
        <p>
          {s.overridden} of {s.approved + s.rejected} decisions ({pct(s.overrideRate)}). {s.followed} followed the recommendation.
        </p>
      )}
      {s.overrideReasons.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reason</th>
                <th className={styles.num}>Times</th>
              </tr>
            </thead>
            <tbody>
              {s.overrideReasons.map((r) => (
                <tr key={r.reason}>
                  <td>{r.reason}</td>
                  <td className={styles.num}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : s.approved + s.rejected > 0 ? (
        <p className="muted">No overrides yet.</p>
      ) : null}

      <h2>Invoice dollars</h2>
      <ul className={styles.tiles} aria-label="Invoice dollars">
        <Tile value={usd(s.dollars.approved)} label="Approved today" tone="approve" />
        <Tile value={usd(s.dollars.rejected)} label="Rejected today (held back)" tone="reject" />
        <Tile value={usd(s.dollars.pending)} label="Still waiting" tone="review" />
      </ul>
      {s.totalUnreadable > 0 ? (
        <p className="muted">
          {s.totalUnreadable} set{s.totalUnreadable === 1 ? "" : "s"} had a total that could not be read and {s.totalUnreadable === 1 ? "is" : "are"} left out of these dollars.
        </p>
      ) : null}

      <h2>Who decided</h2>
      {s.byPerson.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Person</th>
                <th className={styles.num}>Approved</th>
                <th className={styles.num}>Rejected</th>
              </tr>
            </thead>
            <tbody>
              {s.byPerson.map((p) => (
                <tr key={p.person}>
                  <td>{p.person}</td>
                  <td className={styles.num}>{p.approved}</td>
                  <td className={styles.num}>{p.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nobody has decided a set yet.</p>
      )}
    </main>
  );
}
