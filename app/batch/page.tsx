import Link from "next/link";
import { BatchUpload } from "./BatchUpload";

export default function BatchPage() {
  return (
    <main>
      <nav>
        <Link href="/">Review queue</Link>
        <strong>Upload a batch</strong>
        <Link href="/try">Check one set</Link>
      </nav>
      <h1>Upload the morning batch</h1>
      <p className="muted">
        Drop in every PO, receiving report and invoice at once. Claude reads each file, the app joins each invoice to its
        PO and receiving report by PO number, and the rules decide. Anything it can&apos;t place is set aside with a reason.
        Use synthetic documents only.
      </p>
      <BatchUpload />
    </main>
  );
}
