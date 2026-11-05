/**
 * Runs every rule over the two sample invoice sets and prints each check the
 * way an AP specialist would read it. Usage: npm run demo:rules
 */
import { sampleSets } from "../lib/match/fixtures";
import type { CheckResult } from "../lib/match/types";

const mark: Record<CheckResult, string> = { pass: "✓", fail: "✗ FLAGGED", needs_review: "? NEEDS REVIEW" };

for (const s of sampleSets) {
  const counts = { pass: 0, fail: 0, needs_review: 0 };
  for (const t of s.traces) counts[t.result]++;

  console.log(`${s.id} · ${s.invoice} · ${s.label}`);
  console.log(`  ${s.traces.length} checks: ${counts.pass} passed, ${counts.fail} flagged, ${counts.needs_review} need review`);
  for (const t of s.traces) {
    const line = t.result === "pass" ? `  ✓ ${t.rule}` : `  ${mark[t.result]}  ${t.rule}\n      ${t.reason}`;
    console.log(line);
  }
  console.log();
}
