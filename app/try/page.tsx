import { Nav } from "../components/Nav";
import { TryForm } from "./TryForm";

export default function TryPage() {
  return (
    <main>
      <Nav current="/try" />
      <h1>Check one invoice set</h1>
      <p className="muted">
        Upload a purchase order, an optional receiving report and an invoice. Claude reads them; fixed rules decide.
        Use synthetic documents only. Results aren't saved yet.
      </p>
      <TryForm />
    </main>
  );
}
