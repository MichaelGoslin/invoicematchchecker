import Link from "next/link";
import { TryForm } from "./TryForm";

export default function TryPage() {
  return (
    <main>
      <nav>
        <Link href="/">Review queue</Link>
        <strong>Check a set</strong>
      </nav>
      <h1>Check one invoice set</h1>
      <p className="muted">
        Upload a purchase order, an optional receiving report and an invoice. Claude reads them; fixed rules decide.
        Use synthetic documents only. Results aren't saved yet.
      </p>
      <TryForm />
    </main>
  );
}
