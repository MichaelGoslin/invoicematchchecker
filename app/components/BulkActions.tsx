"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAME_KEY = "imc-reviewer-name";

/** Story 5: approve every clean set in one click, then export approved sets for the ERP. Placeholder for Joan's design. */
export function BulkActions({ cleanCount, exportCount }: { cleanCount: number; exportCount: number }) {
  const router = useRouter();
  const [actor, setActor] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActor(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);
  const remember = () => {
    try {
      localStorage.setItem(NAME_KEY, actor);
    } catch {}
  };

  async function approveClean() {
    setBusy(true);
    setMessage(null);
    remember();
    try {
      const res = await fetch("/api/sets/approve-clean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor }),
      });
      const json = await res.json();
      setMessage(res.ok ? `Approved ${json.approved.length} clean set${json.approved.length === 1 ? "" : "s"}.` : json.error);
      router.refresh();
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setMessage(null);
    remember();
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor }),
      });
      if (!res.ok) {
        setMessage((await res.json()).error);
        return;
      }
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "approved-invoices.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${res.headers.get("x-export-count")} approved set(s) to ${name}.`);
      router.refresh();
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bulk">
      <label>
        Your name
        <input value={actor} onChange={(e) => setActor(e.target.value)} maxLength={100} />
      </label>
      <div className="buttons">
        <button type="button" disabled={busy || !actor.trim() || cleanCount === 0} onClick={approveClean}>
          Approve all {cleanCount} clean
        </button>
        <button type="button" className="secondary" disabled={busy || !actor.trim() || exportCount === 0} onClick={exportCsv}>
          Export {exportCount} approved
        </button>
      </div>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </div>
  );
}
