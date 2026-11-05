/** Turns an evaluation into the numbers that matter, and a plain-text report. */
import type { FieldOutcome } from "./fields";
import type { EvalResult } from "./run";

/** claude-opus-5-5 list prices, dollars per million tokens. */
const PRICE = { input: 4, output: 20 };

export interface EvalSummary {
  sets: number;
  setsAgreeing: number;
  falseApprovals: string[];
  /** Sets the key approves that the engine sent to a person anyway: the cost of caution. */
  extraReviews: string[];
  unreadableSets: string[];
  fields: { scored: number; byOutcome: Record<FieldOutcome, number>; accuracy: number };
  decisionFields: { scored: number; byOutcome: Record<FieldOutcome, number>; accuracy: number };
  confidentMisreads: { setId: string; document: string; field: string; line: number | null; read: string | null; correct: string; confidence: number | null; decisionField: boolean }[];
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  documentsRead: number;
  fromCache: number;
}

const OUTCOMES: FieldOutcome[] = ["correct", "correct_unsure", "caught", "confident_misread", "missing", "not_extracted"];

function tally(rows: { outcome: FieldOutcome }[]) {
  const byOutcome = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<FieldOutcome, number>;
  for (const r of rows) byOutcome[r.outcome]++;
  const scored = rows.length - byOutcome.not_extracted;
  const right = byOutcome.correct + byOutcome.correct_unsure;
  return { scored, byOutcome, accuracy: scored === 0 ? 0 : right / scored };
}

export function summarize(result: EvalResult): EvalSummary {
  const { fields, sets, usage } = result;
  return {
    sets: sets.length,
    setsAgreeing: sets.filter((s) => s.agrees).length,
    falseApprovals: sets.filter((s) => s.falseApproval).map((s) => s.setId),
    extraReviews: sets.filter((s) => s.key.outcome === "approve" && s.engine.outcome === "review").map((s) => s.setId),
    unreadableSets: sets.filter((s) => s.engine.reason === "unreadable").map((s) => s.setId),
    fields: tally(fields),
    decisionFields: tally(fields.filter((f) => f.decisionField)),
    confidentMisreads: fields
      .filter((f) => f.outcome === "confident_misread")
      .map(({ setId, document, field, line, read, correct, confidence, decisionField }) => ({
        setId,
        document,
        field,
        line,
        read,
        correct,
        confidence,
        decisionField,
      })),
    usage: {
      ...usage,
      estimatedCostUsd: Math.round(((usage.inputTokens * PRICE.input + usage.outputTokens * PRICE.output) / 1e6) * 100) / 100,
    },
    documentsRead: result.documentsRead,
    fromCache: result.fromCache,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function formatReport(s: EvalSummary, result: EvalResult): string {
  const lines: string[] = [];
  const decisionMisreads = s.confidentMisreads.filter((m) => m.decisionField);
  lines.push(`Sets: ${s.sets} · documents read: ${s.documentsRead} (${s.fromCache} from cache)`);
  lines.push(`False approvals: ${s.falseApprovals.length}${s.falseApprovals.length ? `  ← ${s.falseApprovals.join(", ")}` : ""}`);
  lines.push(`Confident misreads of decision fields: ${decisionMisreads.length}`);
  lines.push(`Sets matching the answer key: ${s.setsAgreeing} of ${s.sets}`);
  lines.push(`Clean sets sent to a person anyway: ${s.extraReviews.length}${s.extraReviews.length ? ` (${s.extraReviews.join(", ")})` : ""}`);
  if (s.unreadableSets.length) lines.push(`Sets with an unreadable document: ${s.unreadableSets.join(", ")}`);
  lines.push("");
  const fieldLine = (label: string, t: EvalSummary["fields"]) =>
    `${label}: ${pct(t.accuracy)} right (${t.byOutcome.correct + t.byOutcome.correct_unsure} of ${t.scored}) · ` +
    `${t.byOutcome.correct_unsure} right but unsure · ${t.byOutcome.caught} wrong and caught · ` +
    `${t.byOutcome.missing} not read · ${t.byOutcome.confident_misread} confident misreads`;
  lines.push(fieldLine("Decision fields", s.decisionFields));
  lines.push(fieldLine("All fields", s.fields));
  if (s.confidentMisreads.length) {
    lines.push("", "Confident misreads:");
    for (const m of s.confidentMisreads) {
      const where = m.line === null ? m.field : `line ${m.line} ${m.field}`;
      lines.push(`  ${m.setId} ${m.document} ${where}: read "${m.read}" at ${m.confidence?.toFixed(2)}, printed "${m.correct}"${m.decisionField ? "  [decision field]" : ""}`);
    }
  }
  const disagreements = result.sets.filter((x) => !x.agrees);
  if (disagreements.length) {
    lines.push("", "Sets that differ from the key:");
    for (const d of disagreements) {
      const fmt = (x: { outcome: string; reason: string; failedRules: string[] }) => `${x.outcome}/${x.reason} (${x.failedRules.join(", ") || "none"})`;
      lines.push(`  ${d.setId} [${d.seededProblem}${d.isScan ? ", scan" : ""}]: engine ${fmt(d.engine)}; key ${fmt(d.key)}${d.problems.length ? ` · ${d.problems.join("; ")}` : ""}`);
    }
  }
  lines.push("", `Tokens: ${s.usage.inputTokens.toLocaleString()} in, ${s.usage.outputTokens.toLocaleString()} out · est. $${s.usage.estimatedCostUsd.toFixed(2)}`);
  return lines.join("\n");
}
