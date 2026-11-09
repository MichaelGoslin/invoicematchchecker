"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ACCEPT, addFiles, documentTypeLabel, formatSize, progress, tally, type ReadStatus, type Rejected } from "@/lib/batch/uploadUi";

type FileState = { name: string; size: number; status: ReadStatus; detail?: string };
interface MatchResult {
  sets: { setId: string; invoiceFile: string; invoiceNumber: string | null; recommendation: string; reason: string; summary: string }[];
  setAside: { fileName: string; reason: string }[];
}

/** How many files are read at once. Each read is one Claude call. */
const PARALLEL = 4;
const LABEL: Record<string, string> = { approve: "Recommend approve", review: "Needs review", reject: "Recommend reject" };
const STATUS_TEXT: Record<ReadStatus, string> = { waiting: "Waiting", reading: "Reading…", read: "Read", failed: "Could not read" };

/** Story 1: drop in the morning batch, watch each file get read, then see how the sets came out. */
export function BatchUpload() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [turnedAway, setTurnedAway] = useState<Rejected[]>([]);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  function pick(incoming: File[]) {
    const r = addFiles(picked, incoming);
    setPicked(r.files);
    setTurnedAway(r.rejected);
    setResult(null);
    setError(null);
  }

  async function run(list: File[]) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFiles(list.map((f) => ({ name: f.name, size: f.size, status: "waiting" })));
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
            else update(i, { status: "read", detail: `${documentTypeLabel(json.documentType)} ${json.documentNumber ?? ""}`.trim() });
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
      setPicked([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPicked([]);
    setFiles([]);
    setResult(null);
    setError(null);
    setTurnedAway([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const p = progress(files.map((f) => f.status));
  const counts = result ? tally(result.sets) : null;

  return (
    <>
      {!busy && !result ? (
        <div className="stack">
          <label
            htmlFor={inputId}
            className={`drop${dragging ? " dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(Array.from(e.dataTransfer.files));
            }}
          >
            <strong>Drop the day&apos;s documents here, or click to choose</strong>
            <span className="muted">POs, receiving reports and invoices, in any order. PDF, PNG, JPEG or text, up to 20 MB each.</span>
            <input
              ref={inputRef}
              id={inputId}
              className="visually-hidden"
              type="file"
              multiple
              accept={ACCEPT}
              onChange={(e) => {
                pick(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>

          {turnedAway.length > 0 ? (
            <div role="alert" className="turned-away">
              <strong>
                {turnedAway.length} file{turnedAway.length === 1 ? " was" : "s were"} not added
              </strong>
              <ul className="notes">
                {turnedAway.map((r, i) => (
                  <li key={i}>
                    {r.name}: {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {picked.length > 0 ? (
            <>
              <ul className="files" aria-label="Files ready to upload">
                {picked.map((f, i) => (
                  <li key={`${f.name}-${f.size}`}>
                    <span className="file-name">{f.name}</span>
                    <span className="muted">{formatSize(f.size)}</span>
                    <button type="button" className="link" aria-label={`Remove ${f.name}`} onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="buttons">
                <button type="button" onClick={() => void run(picked)}>
                  Upload and match {picked.length} file{picked.length === 1 ? "" : "s"}
                </button>
                <button type="button" className="secondary" onClick={startOver}>
                  Clear
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <section aria-label="Reading progress">
          {busy ? (
            <>
              <p role="status">
                Reading {p.finished} of {p.total} files{p.failed > 0 ? ` (${p.failed} could not be read)` : ""}. Matching starts when every file is read.
              </p>
              <progress value={p.finished} max={p.total} aria-label="Files read" />
            </>
          ) : null}
          <ul className="files">
            {files.map((f, i) => (
              <li key={i}>
                <span className="file-name">{f.name}</span>
                <span className="muted detail">{f.detail ?? formatSize(f.size)}</span>
                <span className={`chip ${f.status}`}>{STATUS_TEXT[f.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result && counts ? (
        <section aria-label="Batch result">
          <h2>{result.sets.length} set{result.sets.length === 1 ? "" : "s"} matched</h2>
          <ul className="summary" aria-label="How the sets came out">
            <li className="clean">
              <strong>{counts.approve}</strong>
              <span>Recommend approve</span>
            </li>
            <li className="gated">
              <strong>{counts.review}</strong>
              <span>Needs review</span>
            </li>
            <li className="reject">
              <strong>{counts.reject}</strong>
              <span>Recommend reject</span>
            </li>
            {result.setAside.length > 0 ? (
              <li>
                <strong>{result.setAside.length}</strong>
                <span>Set aside</span>
              </li>
            ) : null}
          </ul>
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
          <div className="buttons">
            <Link className="button" href="/">
              Open the review queue
            </Link>
            <button type="button" className="secondary" onClick={startOver}>
              Upload another batch
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
