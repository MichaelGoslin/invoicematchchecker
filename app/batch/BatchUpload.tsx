"use client";

import { useState } from "react";

type FileState = { name: string; status: "waiting" | "reading" | "read" | "failed"; detail?: string };
interface MatchResult {
  sets: { setId: string; invoiceFile: string; invoiceNumber: string | null; recommendation: string; reason: string; summary: string }[];
  setAside: { fileName: string; reason: string }[];
}

/** How many files are read at once. Each read is one Claude call. */
const PARALLEL = 4;
const LABEL: Record<string, string> = { approve: "Recommend approve", review: "Needs review", reject: "Recommend reject" };

/** Story 1: upload the morning batch at once. Placeholder for Joan's design. */
export function BatchUpload() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  async function run(list: File[]) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFiles(list.map((f) => ({ name: f.name, status: "waiting" })));
    const update = (i: number, s: Partial<FileState>) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, ...s } : f)));

    try {
      const created = await fetch("/api/batches", { method: "POST" });
      if (!created.ok) throw new Error((await created.json()).error ?? "Could not start a batch.");
      const { batchId } = (await created.json()) as { batchId: string };

      let next = 0;
      const worker = async () => {
        while (next < list.length) {
          const i = next++;
          update(i, { status: "reading" });
          const body = new FormData();
          body.append("file", list[i]!);
          try {
            const res = await fetch(`/api/batches/${batchId}/documents`, { method: "POST", body });
            const json = await res.json();
            if (!res.ok) update(i, { status: "failed", detail: json.error });
            else update(i, { status: "read", detail: `${json.documentType.replace("_", " ")} ${json.documentNumber ?? ""}`.trim() });
          } catch {
            update(i, { status: "failed", detail: "Could not reach the server." });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));

      const matched = await fetch(`/api/batches/${batchId}/match`, { method: "POST" });
      const json = await matched.json();
      if (!matched.ok) throw new Error(json.error ?? "Matching failed.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const done = files.filter((f) => f.status === "read" || f.status === "failed").length;

  return (
    <>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("files") as HTMLInputElement;
          if (input.files?.length) void run(Array.from(input.files));
        }}
      >
        <label>
          Documents <span className="muted">(POs, receiving reports and invoices, in any order)</span>
          <input type="file" name="files" multiple accept=".pdf,.png,.jpg,.jpeg,.txt" required disabled={busy} />
        </label>
        <button type="submit" disabled={busy}>{busy ? `Reading ${done} of ${files.length}…` : "Upload and match"}</button>
      </form>

      {error ? <p className="error" role="alert">{error}</p> : null}

      {files.length > 0 ? (
        <ul className="notes">
          {files.map((f, i) => (
            <li key={i}>
              {f.name}: {f.status}
              {f.detail ? ` · ${f.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {result ? (
        <>
          <h2>{result.sets.length} sets matched</h2>
          <ul className="notes">
            {result.sets.map((s) => (
              <li key={s.setId}>
                <span className={`badge ${s.recommendation}`}>{LABEL[s.recommendation]}</span> {s.invoiceNumber ?? s.invoiceFile} ({s.setId}): {s.summary}
              </li>
            ))}
          </ul>
          {result.setAside.length > 0 ? (
            <>
              <h2>Set aside ({result.setAside.length})</h2>
              <p className="muted">These files weren&apos;t placed in a set. A person needs to look at them.</p>
              <ul className="notes">
                {result.setAside.map((s, i) => (
                  <li key={i}>
                    {s.fileName}: {s.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p>
            <a href="/">Go to the review queue</a>
          </p>
        </>
      ) : null}
    </>
  );
}
