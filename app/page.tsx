import Link from "next/link";
import { countReadyToExport, listCleanPending } from "@/lib/db/approvals";
import { getDb } from "@/lib/db/client";
import { listQueue, type StoredSet } from "@/lib/db/sets";
import { sampleSets } from "@/lib/match/fixtures";
import { groupByReason } from "@/lib/queue/groups";
import { BulkActions } from "./components/BulkActions";
import { ReviewerNameField, ReviewerProvider } from "./components/ReviewerName";
import { DecisionActions } from "./components/DecisionActions";
import { ExplainButton } from "./components/ExplainButton";
import { DecisionRow } from "./components/DecisionRow";
import { Nav } from "./components/Nav";

// The queue reads live data on every request.
export const dynamic = "force-dynamic";

const statusText = (s: StoredSet) =>
  s.status === "pending"
    ? undefined
    : `${s.status === "approved" ? "Approved" : "Rejected"} by ${s.decidedBy}${s.overridden ? " (override)" : ""}${s.exportedAt ? " · exported" : ""}`;


function Summary({ groups, decided }: { groups: { reason: string; title: string; count: number }[]; decided?: number }) {
  return (
    <ul className="summary" aria-label="Queue summary">
      {groups.map((g) => (
        <li key={g.reason} className={g.reason}>
          <strong>{g.count}</strong>
          <span>{g.title}</span>
        </li>
      ))}
      {decided !== undefined ? (
        <li className="decided">
          <strong>{decided}</strong>
          <span>Decided</span>
        </li>
      ) : null}
    </ul>
  );
}

export default async function QueuePage() {
  const db = getDb();

  if (!db) {
    const groups = groupByReason(sampleSets);
    return (
      <main>
        <Nav current="/" />
        <h1>Review queue</h1>
        <p className="muted">
          No database is configured, so this shows sample data. The tool recommends; a person approves every payment.
        </p>
        <Summary groups={groups.map((g) => ({ reason: g.reason, title: g.title, count: g.items.length }))} />
        {groups.map((g) => (
          <section key={g.reason} aria-labelledby={`g-${g.reason}`}>
            <h2 id={`g-${g.reason}`}>
              {g.title} <span className="count">{g.items.length}</span>
            </h2>
            <p className="muted">{g.blurb}</p>
            <ul className="queue">
              {g.items.map((s) => (
                <DecisionRow key={s.id} decision={s.decision} traces={s.traces} title={`${s.invoice} · ${s.label}`} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    );
  }

  const [sets, clean, exportCount] = await Promise.all([listQueue(db), listCleanPending(db), countReadyToExport(db)]);
  const pending = sets.filter((s) => s.status === "pending");
  const decided = sets.filter((s) => s.status !== "pending");
  const groups = groupByReason(pending);
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
    <ReviewerProvider>
    <main>
      <Nav current="/" />
      <h1>Review queue</h1>
      <p className="muted">
        {pending.length} waiting. Work from the top: rejects, then uncertain readings, then exceptions, then clean sets.
        The tool recommends; a person approves every payment.
      </p>
      {sets.length === 0 ? (
        <p>
          No sets yet. <Link href="/batch">Upload a batch</Link> to add some.
        </p>
      ) : (
        <>
          <Summary
            groups={groups.map((g) => ({ reason: g.reason, title: g.title, count: g.items.length }))}
            decided={decided.length}
          />
          <ReviewerNameField />
          <BulkActions cleanCount={clean.length} exportCount={exportCount} />
        </>
      )}
      {groups.map((g) => (
        <section key={g.reason} aria-labelledby={`g-${g.reason}`}>
          <h2 id={`g-${g.reason}`}>
            {g.title} <span className="count">{g.items.length}</span>
          </h2>
          <p className="muted">{g.blurb}</p>
          <ul className="queue">{g.items.map(row)}</ul>
        </section>
      ))}
      {decided.length > 0 ? (
        <section>
          <h2>
            Decided <span className="count">{decided.length}</span>
          </h2>
          <ul className="queue">{decided.map(row)}</ul>
        </section>
      ) : null}
    </main>
    </ReviewerProvider>
  );
}
