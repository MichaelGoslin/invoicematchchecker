import Link from "next/link";
import { countReadyToExport, listCleanPending } from "@/lib/db/approvals";
import { getDb } from "@/lib/db/client";
import { listQueue, type StoredSet } from "@/lib/db/sets";
import { compareForQueue } from "@/lib/match/decision";
import { sampleSets } from "@/lib/match/fixtures";
import { BulkActions } from "./components/BulkActions";
import { DecisionActions } from "./components/DecisionActions";
import { ExplainButton } from "./components/ExplainButton";
import { DecisionRow } from "./components/DecisionRow";

// The queue reads live data on every request.
export const dynamic = "force-dynamic";

const statusText = (s: StoredSet) =>
  s.status === "pending"
    ? undefined
    : `${s.status === "approved" ? "Approved" : "Rejected"} by ${s.decidedBy}${s.overridden ? " (override)" : ""}${s.exportedAt ? " · exported" : ""}`;

function Nav() {
  return (
    <nav>
      <strong>Invoice Match Checker</strong>
      <Link href="/batch">Upload a batch</Link>
      <Link href="/try">Check one set</Link>
    </nav>
  );
}

export default async function QueuePage() {
  const db = getDb();

  if (!db) {
    const rows = [...sampleSets].sort((a, b) => compareForQueue(a.decision, b.decision));
    return (
      <main>
        <Nav />
        <h1>Review queue</h1>
        <p className="muted">No database is configured, so this shows sample data. The tool recommends; a person approves every payment.</p>
        <ul className="queue">
          {rows.map((s) => (
            <DecisionRow key={s.id} decision={s.decision} traces={s.traces} title={`${s.invoice} · ${s.label}`} />
          ))}
        </ul>
      </main>
    );
  }

  const [sets, clean, exportCount] = await Promise.all([listQueue(db), listCleanPending(db), countReadyToExport(db)]);
  const pending = sets.filter((s) => s.status === "pending");
  const decided = sets.filter((s) => s.status !== "pending");
  const row = (s: StoredSet) => (
    <DecisionRow
      key={s.id}
      decision={s.decision}
      traces={s.traces}
      title={[s.invoiceNumber, s.invoiceVendor].filter(Boolean).join(" · ") || "invoice details unreadable"}
      status={statusText(s)}
    >
      {s.decision.reason !== "clean" ? <ExplainButton setId={s.id} initial={s.explanation} /> : null}
      {s.status === "pending" ? (
        <DecisionActions setId={s.id} recommendation={s.decision.recommendation} />
      ) : s.overrideReason ? (
        <p className="muted">Override reason: {s.overrideReason}</p>
      ) : null}
    </DecisionRow>
  );

  return (
    <main>
      <Nav />
      <h1>Review queue</h1>
      <p className="muted">
        {pending.length} waiting · rejects first, then sets with uncertain readings, then other exceptions, then clean sets.
        The tool recommends; a person approves every payment.
      </p>
      {sets.length === 0 ? <p>No sets yet. <Link href="/batch">Upload a batch</Link> to add some.</p> : null}
      {sets.length > 0 ? <BulkActions cleanCount={clean.length} exportCount={exportCount} /> : null}
      <ul className="queue">{pending.map(row)}</ul>
      {decided.length > 0 ? (
        <>
          <h2>Decided</h2>
          <ul className="queue">{decided.map(row)}</ul>
        </>
      ) : null}
    </main>
  );
}
