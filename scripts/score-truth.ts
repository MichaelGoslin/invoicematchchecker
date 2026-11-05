/**
 * Prints how the rules engine scores against the sample-data answer key,
 * using printed values (no extraction, no API calls).
 * Usage: npm run score:truth [sample-data/output]
 */
import { scoreAnswerKey } from "../lib/match/answerKey";

const scores = scoreAnswerKey(process.argv[2]);
const agree = scores.filter((s) => s.agrees);
const fmt = (x: { outcome: string; reason: string; failedRules: string[] }) =>
  `${x.outcome}/${x.reason} (${x.failedRules.join(", ") || "none"})`;

console.log(`Agree with key: ${agree.length} of ${scores.length} sets`);
const falseApprovals = scores.filter((s) => s.engine.outcome === "approve" && s.key.outcome !== "approve");
console.log(`False approvals: ${falseApprovals.length}${falseApprovals.length ? ` (${falseApprovals.map((s) => s.setId).join(", ")})` : ""}`);
for (const s of scores.filter((x) => !x.agrees)) {
  console.log(`  ${s.setId} [${s.seededProblem}${s.isScan ? ", scan" : ""}]: engine ${fmt(s.engine)}; key ${fmt(s.key)}`);
}
