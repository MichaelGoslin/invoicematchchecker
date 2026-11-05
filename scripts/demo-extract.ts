/**
 * End to end on real API calls: reads a PO, receiving report and invoice with
 * Claude, runs every rule, and prints the decision. Costs a few cents per run.
 *
 * Usage: npm run demo:extract [folder]   (default: scripts/samples/s15)
 * Needs ANTHROPIC_API_KEY in .env.local or .env.development.local.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type DocumentInput, type DocumentMediaType, extractDocument } from "../lib/extract/extract";
import { toMatchInput } from "../lib/extract/toMatchInput";
import { runSet } from "../lib/match/runSet";

const folder = process.argv[2] ?? "scripts/samples/s15";
const types: Record<string, DocumentMediaType> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".txt": "text/plain" };

const inputs: DocumentInput[] = readdirSync(folder)
  .filter((f) => types[path.extname(f)])
  .map((f) => ({ name: f, mediaType: types[path.extname(f)]!, data: readFileSync(path.join(folder, f)) }));

const started = Date.now();
const results = await Promise.all(inputs.map((i) => extractDocument(i)));

for (const r of results) {
  const d = r.document;
  console.log(`${r.name}: ${d.document_type} (${d.document_type_confidence}) ${d.document_number.value ?? "?"} · model ${r.model} · ${r.usage.inputTokens} in / ${r.usage.outputTokens} out`);
  for (const l of d.lines) {
    const f = (x: { value: number | null; confidence: number }) => `${x.value ?? "∅"}@${x.confidence.toFixed(2)}`;
    console.log(`  line ${l.line_number}: qty ${f(l.quantity)}  price ${f(l.unit_price)}  total ${f(l.line_total)}`);
  }
  for (const note of [...d.reading_problems, ...r.guardNotes]) console.log(`  ! ${note}`);
}

const pick = (type: string) => results.find((r) => r.document.document_type === type);
const purchaseOrder = pick("purchase_order");
const invoice = pick("invoice");
if (!purchaseOrder || !invoice) throw new Error("Need a purchase order and an invoice in the folder.");
const receivingReport = pick("receiving_report");

const { traces, decision } = runSet(
  toMatchInput(path.basename(folder), { purchaseOrder, invoice, ...(receivingReport ? { receivingReport } : {}) }, []),
);

console.log();
for (const t of traces.filter((x) => x.result !== "pass")) {
  console.log(`  ${t.result === "fail" ? "✗ FLAGGED" : "? NEEDS REVIEW"}  ${t.rule}\n      ${t.reason}`);
}
console.log(`\n→ ${decision.summary}  (${decision.reason}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
