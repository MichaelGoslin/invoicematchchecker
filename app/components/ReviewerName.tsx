"use client";

import { createContext, useContext, useEffect, useId, useMemo, useState } from "react";

const NAME_KEY = "imc-reviewer-name";

interface Reviewer {
  /** The reviewer's name as typed. Empty until they enter it. */
  name: string;
  setName: (name: string) => void;
}

const ReviewerContext = createContext<Reviewer | null>(null);

/**
 * Holds the reviewer's name once for the whole queue, remembered in this
 * browser, so it is asked for once and every decision and bulk action uses it.
 */
export function ReviewerProvider({ children }: { children: React.ReactNode }) {
  const [name, setNameState] = useState("");

  useEffect(() => {
    try {
      setNameState(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);

  const value = useMemo<Reviewer>(
    () => ({
      name,
      setName: (next) => {
        setNameState(next);
        try {
          localStorage.setItem(NAME_KEY, next);
        } catch {}
      },
    }),
    [name],
  );

  return <ReviewerContext.Provider value={value}>{children}</ReviewerContext.Provider>;
}

export function useReviewer(): Reviewer {
  const ctx = useContext(ReviewerContext);
  if (!ctx) throw new Error("useReviewer must be used inside ReviewerProvider.");
  return ctx;
}

/** The one place the reviewer enters their name. */
export function ReviewerNameField() {
  const id = useId();
  const { name, setName } = useReviewer();
  return (
    <div className="reviewer">
      <label htmlFor={id}>
        Your name
        <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" aria-describedby={`${id}-hint`} />
      </label>
      <span id={`${id}-hint`} className="muted">
        Saved with every decision you make and in the audit log. Remembered in this browser.
      </span>
    </div>
  );
}
