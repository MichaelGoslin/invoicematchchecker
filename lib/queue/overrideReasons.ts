/**
 * Reason codes for a person going against the engine's recommendation. The API
 * stores one free-text reason, so the code's label and the note are joined into it.
 */
export const OVERRIDE_REASONS = [
  { code: "price_agreed", label: "Price change agreed with the buyer" },
  { code: "quantity_confirmed", label: "Quantity confirmed with receiving" },
  { code: "vendor_variant", label: "Same vendor, name printed differently" },
  { code: "duplicate_ruled_out", label: "Not a duplicate (checked history)" },
  { code: "po_corrected", label: "PO number corrected on the invoice" },
  { code: "reading_corrected", label: "Value was misread; documents checked by hand" },
  { code: "other", label: "Other (explain in the note)" },
] as const;

export type OverrideReasonCode = (typeof OVERRIDE_REASONS)[number]["code"];

/** The text saved with an override. Empty when there is neither a code nor a note. */
export function overrideReasonText(code: string, note: string): string {
  const label = OVERRIDE_REASONS.find((r) => r.code === code)?.label ?? "";
  const n = note.trim();
  return label && n ? `${label}: ${n}` : label || n;
}

/** Same rule as isOverride in lib/db/sets.ts, kept here so client code doesn't import the database module. */
export const isAgainstRecommendation = (action: "approve" | "reject", recommendation: "approve" | "review" | "reject") =>
  action === "approve" ? recommendation !== "approve" : recommendation === "approve";
