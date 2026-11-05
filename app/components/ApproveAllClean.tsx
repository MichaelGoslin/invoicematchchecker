"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAME_KEY } from "./DecisionActions";

/**
 * Approves every clean set in the group in one action. Each set is still saved
 * through the normal decision route, so each one gets its own audit-log entry.
 * Clean sets are recommended for approval, so none of these is an override.
 */
export function ApproveAllClean({ setIds }: { setIds: string[] }) {
  const router = useRouter();
  const [actor, setActor] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActor(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      localStorage.setItem(NAME_KEY, actor);
    } catch {}
    let done = 0;
    const failed: string[] = [];
    for (const id of setIds) {
      try {
        const res = await fetch(`/api/sets/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", actor }),
        });
        if (res.ok) done++;
        else failed.push(id);
      } catch {
        failed.push(id);
      }
    }
    setBusy(false);
    setConfirming(false);
    setMessage(
      failed.length === 0
        ? `Approved ${done} clean set${done === 1 ? "" : "s"}.`
        : `Approved ${done}. ${failed.length} could not be saved (${failed.join(", ")}); they are still in the queue.`,
    );
    router.refresh();
  }

  return (
    <div className="bulk">
      <label>
        Your name
        <input value={actor} onChange={(e) => setActor(e.target.value)} maxLength={100} />
      </label>
      {confirming ? (
        <div className="buttons">
          <span>
            Approve {setIds.length} clean set{setIds.length === 1 ? "" : "s"} as <strong>{actor.trim()}</strong>?
          </span>
          <button type="button" disabled={busy} onClick={run}>
            {busy ? "Approving…" : "Yes, approve all"}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" disabled={!actor.trim() || setIds.length === 0} onClick={() => setConfirming(true)}>
          Approve all {setIds.length} clean set{setIds.length === 1 ? "" : "s"}
        </button>
      )}
      {message ? (
        <p role="status" className="muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
