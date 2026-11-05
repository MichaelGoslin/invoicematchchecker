/**
 * Runs every rule over the sample invoice sets, prints each check the way an
 * AP specialist would read it, then the set decision and the review-queue order.
 * Usage: npm run demo:rules
 */
import { compareForQueue, type Recommendation } from "../lib/match/decision";
import { sampleSets } from "../lib/match/fixtures";
import type { CheckResult } from "../lib/match/types";

const mark: Record<CheckResult, string> = { pass: "✓", fail: "✗ FLAGGED", needs_review: "? NEEDS REVIEW" };
const rec: Record<Recommendation, string> = {
  approve: "RECOMMEND APPROVE",
  review: "NEEDS REVIEW",
  reject: "RECOMMEND REJECT",
};

for (const s of sampleSets) {
  const { counts } = s.decision;
  console.log(`${s.id} · ${s.invoice} · ${s.label}`);
  console.log(`  ${s.traces.length} checks: ${counts.pass} passed, ${counts.fail} flagged, ${counts.needs_review} need review`);
  for (const t of s.traces) {
    const where = t.scope === "line" ? `line ${t.lineIndex! + 1}` : t.scope;
    const line =
      t.result === "pass"
        ? `  ✓ [${where}] ${t.rule}`
        : `  ${mark[t.result]}  [${where}] ${t.rule}\n      ${t.reason}`;
    console.log(line);
  }
  console.log(`  → ${rec[s.decision.recommendation]} (${s.decision.reason})`);
  console.log(`    ${s.decision.summary}`);
  console.log();
}

console.log("Review queue order:");
[...sampleSets.map((s) => s.decision)].sort(compareForQueue).forEach((d, i) => {
  console.log(`  ${i + 1}. ${d.setId}  ${rec[d.recommendation].padEnd(17)}  ${d.reason}`);
});
