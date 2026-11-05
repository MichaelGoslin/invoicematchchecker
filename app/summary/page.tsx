import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listQueue } from "@/lib/db/sets";
import { sampleSets } from "@/lib/match/fixtures";
import { summarize, type SummarySet } from "@/lib/summary/summarize";
import styles from "./summary.module.css";

// Reads live data on every request.
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

function Nav() {
  return (
    <nav>
      <strong>Invoice Match Checker</strong>
      <Link href="/">Review queue</Link>
      <Link href="/batch">Upload a batch</Link>
    </nav>
  );
}

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
  let sets: SummarySet[];
  if (db) {
    sets = await listQueue(db);
  } else {
    // No database: show the built-in sample sets as a day with nothing decided yet.
    sets = sampleSets.map((s) => ({
      status: "pending",
      decision: s.decision,
      decidedBy: null,
      overridden: false,
      overrideReason: null,
      exportedAt: null,
      invoiceTotal: null,
    }));
  }
  const s = summarize(sets);

  return (
    <main>
      <Nav />
      <h1>Daily summary</h1>
      <p className="muted">
        {db ? "Every set in the queue." : "No database is configured, so this uses the sample sets."} The tool recommends; a
        person approves every payment.
      </p>

      <h2>What came in</h2>
      <ul className={styles.tiles} aria-label="What came in">
        <Tile value={s.total} label="Sets checked" />
        <Tile value={s.recommended.approve} label="Recommended approve" tone="approve" />
        <Tile value={s.recommended.review} label="Needs review" tone="review" />
        <Tile value={s.recommended.reject} label="Recommended reject" tone="reject" />
      </ul>

      <h2>What people decided</h2>
      <ul className={styles.tiles} aria-label="What people decided">
        <Tile value={s.approved} label="Approved" tone="approve" />
        <Tile value={s.rejected} label="Rejected" tone="reject" />
        <Tile value={s.pending} label="Still waiting" tone="review" />
        <Tile value={s.exported} label="Exported" />
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
        <Tile value={usd(s.dollars.approved)} label="Approved" tone="approve" />
        <Tile value={usd(s.dollars.rejected)} label="Rejected (held back)" tone="reject" />
        <Tile value={usd(s.dollars.pending)} label="Waiting" tone="review" />
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
