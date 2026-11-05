/**
 * Scores live extraction end to end on Joan's sample sets: reads every
 * document with Claude, compares each field with field_truth.csv, runs the
 * rules, and compares each set with answer_key.csv.
 *
 *   npm run score:extraction                       show what a full run would cost; reads nothing
 *   npm run score:extraction -- --yes              full run, real Claude calls (about 300 documents)
 *   npm run score:extraction -- --sets S-001,S-034 --yes   just these sets
 *   npm run score:extraction -- --fake             free dry run with a perfect fake reader
 *   npm run score:extraction -- --reuse eval-results/<run>   re-score saved readings, no calls
 *
 * Every reading is saved under eval-results/<run>/readings, with the summary
 * and the report next to it. Nothing is written to any database.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type ExtractionResult, extractDocument } from "../lib/extract/extract";
import { formatReport, summarize } from "../lib/eval/report";
import { type ExtractionCache, type Extractor, runEval } from "../lib/eval/run";
import { truthReader } from "../lib/eval/truthReader";

const ROOT = "sample-data/output";
/** Measured on Joan's PDFs: about 4,000 input and 1,000 output tokens per document. */
const EST_COST_PER_DOC = (4000 * 4 + 1000 * 20) / 1e6;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const setIds = value("sets")?.split(",").map((s) => s.trim()).filter(Boolean);
const concurrency = Number(value("concurrency") ?? 4);
const reuse = value("reuse");
const fake = flag("fake");

const countDocs = (ids: string[] | undefined) => {
  const sets = readdirSync(path.join(ROOT, "sets")).filter((d) => /^S-\d{3}$/.test(d) && (!ids || ids.includes(d)));
  return {
    sets: sets.length,
    docs: sets.reduce((n, s) => n + readdirSync(path.join(ROOT, "sets", s)).filter((f) => /^(po|receiving|invoice)\.(pdf|jpg|png)$/.test(f)).length, 0),
  };
};

const runDir = reuse ?? path.join("eval-results", `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}${fake ? "-fake" : ""}`);
const readingsDir = path.join(runDir, "readings");

/** Readings saved one file per document, so a stopped run resumes where it left off. */
const fileCache: ExtractionCache = {
  get: (key) => {
    const file = path.join(readingsDir, `${key.replace("/", "_")}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ExtractionResult) : undefined;
  },
  set: (key, result) => writeFileSync(path.join(readingsDir, `${key.replace("/", "_")}.json`), JSON.stringify(result, null, 2)),
};

const { sets, docs } = countDocs(setIds);
let extract: Extractor;
if (fake) {
  extract = truthReader(ROOT);
} else if (reuse) {
  extract = async (input) => {
    throw new Error(`No saved reading for ${input.name} in ${reuse}; rerun without --reuse to read it.`);
  };
} else {
  console.log(`${sets} sets, ${docs} documents. Estimated cost of a live run: about $${(docs * EST_COST_PER_DOC).toFixed(2)} (claude-opus-5-5).`);
  if (!flag("yes")) {
    console.log("Nothing was read. Add --yes to run it, or --fake for a free dry run.");
    process.exit(0);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (looked in the environment, .env.local and .env.development.local).");
    process.exit(1);
  }
  extract = (input) => extractDocument(input);
}

mkdirSync(readingsDir, { recursive: true });
const started = Date.now();
const result = await runEval({
  root: ROOT,
  ...(setIds ? { setIds } : {}),
  extract,
  concurrency,
  cache: fileCache,
  onProgress: (done, total, label) => {
    if (process.stdout.isTTY) process.stdout.write(`\r  read ${done}/${total} · ${label.padEnd(28)}`);
    else if (done % 25 === 0 || done === total) console.log(`  read ${done}/${total}`);
  },
});
process.stdout.write("\n\n");

const summary = summarize(result);
const report = formatReport(summary, result);
writeFileSync(path.join(runDir, "summary.json"), JSON.stringify({ ...summary, sets: result.sets }, null, 2));
writeFileSync(path.join(runDir, "report.txt"), `${report}\n`);
console.log(report);
console.log(`\n${((Date.now() - started) / 1000).toFixed(0)}s · saved to ${runDir}${fake ? " · FAKE READER: not a real score" : ""}`);
