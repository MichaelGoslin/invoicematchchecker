/**
 * Runs the synthetic unit-price cases through the rule and prints each trace
 * the way an AP specialist would read it. Usage: npm run demo:price
 */
import { unitPriceCases } from "../lib/match/fixtures";
import type { CheckResult } from "../lib/match/types";
import { checkUnitPrice, formatPrice } from "../lib/match/unitPrice";

const label: Record<CheckResult, string> = {
  pass: "PASS",
  fail: "FLAGGED",
  needs_review: "NEEDS REVIEW (uncertain)",
};

for (const c of Object.values(unitPriceCases)) {
  const t = checkUnitPrice(c.po, c.invoice);
  const pct = t.variancePct === null ? "n/a" : `${t.variancePct > 0 ? "+" : ""}${t.variancePct.toFixed(2)}%`;
  console.log(`${c.name}: ${t.actual.source} → ${label[t.result]}`);
  console.log(`  PO price   ${formatPrice(t.expected.value)}  (${t.expected.source})`);
  console.log(`  Invoice    ${formatPrice(t.actual.value)}  (${t.actual.source}, read confidence ${t.actual.confidence.toFixed(2)})`);
  console.log(`  Variance   ${pct}  vs tolerance ${t.tolerancePct}%`);
  console.log(`  Reason     ${t.reason}`);
  console.log();
}
