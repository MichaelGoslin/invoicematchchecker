/**
 * End-to-end evaluation over Joan's sample sets: read every document, score
 * each field against field_truth.csv, run the rules on what was read, and
 * score each set against answer_key.csv.
 *
 * The extractor is passed in, so tests use a fake reader and the real run uses
 * Claude. Readings can be cached, so re-scoring after a rules change is free.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentInput, DocumentMediaType, ExtractionResult } from "../extract/extract";
import { SetAssemblyError, type SetDocuments, toMatchInput } from "../extract/toMatchInput";
import { type KeyRow, parseCsv } from "../match/answerKey";
import type { PriorInvoice } from "../match/duplicate";
import { runSet } from "../match/runSet";
import { type DocRole, type FieldScore, parseFieldTruth, scoreFields } from "./fields";

export type Extractor = (input: DocumentInput) => Promise<ExtractionResult>;

export interface ExtractionCache {
  get(key: string): ExtractionResult | undefined;
  set(key: string, result: ExtractionResult): void;
}

export interface EvalOptions {
  root?: string;
  /** Only these sets; default all. */
  setIds?: string[];
  extract: Extractor;
  /** Documents read at once. Default 4. */
  concurrency?: number;
  cache?: ExtractionCache;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface SetEval {
  setId: string;
  seededProblem: string;
  isScan: boolean;
  /** Documents that couldn't be read or assembled, with why. Such a set goes to a person. */
  problems: string[];
  engine: { outcome: string; reason: string; failedRules: string[] };
  key: { outcome: string; reason: string; failedRules: string[] };
  /** Same outcome, reason and failed rules as the key. */
  agrees: boolean;
  /** Recommended approval where the key does not. The number that must be zero. */
  falseApproval: boolean;
  /** Confident misreads of decision fields in this set. */
  confidentMisreads: number;
}

export interface EvalResult {
  fields: FieldScore[];
  sets: SetEval[];
  usage: { inputTokens: number; outputTokens: number };
  documentsRead: number;
  /** Readings taken from the cache instead of a new call. */
  fromCache: number;
}

const DOC_FILES: { role: DocRole; files: [string, DocumentMediaType][] }[] = [
  { role: "po", files: [["po.pdf", "application/pdf"]] },
  { role: "receiving", files: [["receiving.pdf", "application/pdf"]] },
  { role: "invoice", files: [["invoice.pdf", "application/pdf"], ["invoice.jpg", "image/jpeg"], ["invoice.png", "image/png"]] },
];

const SAFE_SET_ID = /^S-\d{3}$/;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
}

export async function runEval(options: EvalOptions): Promise<EvalResult> {
  const root = options.root ?? "sample-data/output";
  const keyRows = parseCsv(readFileSync(path.join(root, "answer_key.csv"), "utf8")) as unknown as KeyRow[];
  const truth = parseFieldTruth(parseCsv(readFileSync(path.join(root, "field_truth.csv"), "utf8")));
  const priors = JSON.parse(readFileSync(path.join(root, "history.json"), "utf8")) as PriorInvoice[];

  const wanted = options.setIds ? new Set(options.setIds) : null;
  const rows = keyRows.filter((r) => SAFE_SET_ID.test(r.set_id) && (!wanted || wanted.has(r.set_id)));

  // Every document to read, across all sets.
  const jobs: { setId: string; role: DocRole; input: DocumentInput }[] = [];
  for (const row of rows) {
    for (const { role, files } of DOC_FILES) {
      const found = files.find(([name]) => existsSync(path.join(root, "sets", row.set_id, name)));
      if (!found) continue;
      const [name, mediaType] = found;
      jobs.push({
        setId: row.set_id,
        role,
        input: { name: `${row.set_id}-${name}`, mediaType, data: readFileSync(path.join(root, "sets", row.set_id, name)) },
      });
    }
  }

  const readings = new Map<string, ExtractionResult>();
  const failures = new Map<string, string>();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let done = 0;
  let fromCache = 0;
  await pool(jobs, options.concurrency ?? 4, async (job) => {
    const key = `${job.setId}/${job.role}`;
    try {
      let result = options.cache?.get(key);
      if (result) fromCache++;
      else {
        result = await options.extract(job.input);
        options.cache?.set(key, result);
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
      }
      readings.set(key, result);
    } catch (err) {
      failures.set(key, `${job.input.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    options.onProgress?.(++done, jobs.length, job.input.name);
  });

  const fields: FieldScore[] = [];
  const sets: SetEval[] = rows.map((row) => {
    const id = row.set_id;
    const problems = DOC_FILES.map(({ role }) => failures.get(`${id}/${role}`)).filter((p): p is string => !!p);
    for (const { role } of DOC_FILES) {
      const reading = readings.get(`${id}/${role}`);
      if (reading) fields.push(...scoreFields(truth.filter((t) => t.setId === id && t.document === role), reading));
    }

    const keyRules = row.expected_failed_rules.split(/[;|\s]+/).filter(Boolean).sort();
    const key = { outcome: row.expected_outcome, reason: row.expected_reason, failedRules: keyRules };
    const confidentMisreads = fields.filter((f) => f.setId === id && f.decisionField && f.outcome === "confident_misread").length;

    let engine: SetEval["engine"];
    const invoice = readings.get(`${id}/invoice`);
    if (problems.length > 0 || !invoice) {
      // A document that couldn't be read never yields a recommendation: a person handles the set.
      engine = { outcome: "review", reason: "unreadable", failedRules: [] };
    } else {
      const po = readings.get(`${id}/po`);
      const rr = readings.get(`${id}/receiving`);
      const docs: SetDocuments = { invoice, ...(po ? { purchaseOrder: po } : {}), ...(rr ? { receivingReport: rr } : {}) };
      try {
        const { traces, decision } = runSet(toMatchInput(id, docs, priors));
        const failedRules = [...new Set(traces.filter((t) => t.result !== "pass").map((t) => t.rule))].sort();
        engine = { outcome: decision.recommendation, reason: decision.reason, failedRules };
      } catch (err) {
        if (!(err instanceof SetAssemblyError)) throw err;
        problems.push(err.message);
        engine = { outcome: "review", reason: "unreadable", failedRules: [] };
      }
    }

    const agrees =
      engine.outcome === key.outcome && engine.reason === key.reason && engine.failedRules.join(",") === key.failedRules.join(",");
    // The scan (S-087) is clean underneath: approving it is acceptable when nothing on it was misread with confidence.
    const isScan = row.is_scan === "yes";
    const falseApproval = engine.outcome === "approve" && key.outcome !== "approve" && !(isScan && confidentMisreads === 0);
    return { setId: id, seededProblem: row.seeded_problem, isScan, problems, engine, key, agrees, falseApproval, confidentMisreads };
  });

  return { fields, sets, usage, documentsRead: jobs.length - failures.size, fromCache };
}
