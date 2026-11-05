import Link from "next/link";
import { compareForQueue } from "@/lib/match/decision";
import { sampleSets } from "@/lib/match/fixtures";
import { DecisionRow } from "./components/DecisionRow";

/** Review queue over the synthetic sample sets, in queue order. Placeholder until uploads are stored. */
export default function QueuePage() {
  const rows = [...sampleSets].sort((a, b) => compareForQueue(a.decision, b.decision));
  return (
    <main>
      <nav>
        <strong>Invoice Match Checker</strong>
        <Link href="/try">Check a set</Link>
      </nav>
      <h1>Review queue</h1>
      <p className="muted">
        Sample data only. Rejects first, then sets with uncertain readings, then other exceptions, then clean sets.
        The tool recommends; a person approves every payment.
      </p>
      <ul className="queue">
        {rows.map((s) => (
          <DecisionRow key={s.id} decision={s.decision} traces={s.traces} title={`${s.invoice} · ${s.label}`} />
        ))}
      </ul>
    </main>
  );
}
