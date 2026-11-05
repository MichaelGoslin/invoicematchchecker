/** Helpers every rule uses: exact number handling, formatting and the confidence gate. */
import type { SourcedValue } from "./types";

export const DEFAULT_MIN_CONFIDENCE = 0.9;

/** Work in ten-thousandths so prices like 4.335 and percent boundaries compare exactly. */
const SCALE = 10_000;
export const toUnits = (n: number) => Math.round(n * SCALE);

/** Dollars to whole cents, absorbing float noise such as 4.37 * 3 = 13.110000000000001. */
export const toCents = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

/** Signed percent of diff over base, rounded to 2 places. Null when base is 0. */
export const pctOf = (diff: number, base: number) =>
  base === 0 ? null : Math.round((diff / base) * 100 * 100) / 100;

/** $4.25, or $4.335 when the price has sub-cent precision. */
export const formatPrice = (n: number) => {
  const cents = Math.round(n * 100) / 100;
  return `$${cents === n ? n.toFixed(2) : n.toFixed(4).replace(/0+$/, "")}`;
};

export const formatPct = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;

const validConfidence = (c: number) => Number.isFinite(c) && c >= 0 && c <= 1;

/** A number that can be compared: finite, not negative, with a valid confidence. */
export const isUsableNumber = (v: SourcedValue<number>) =>
  Number.isFinite(v.value) && v.value >= 0 && validConfidence(v.confidence);

/** Text that can be compared: not blank after normalizing, with a valid confidence. */
export const isUsableText = (v: SourcedValue<string>, normalize: (s: string) => string) =>
  typeof v.value === "string" && normalize(v.value) !== "" && validConfidence(v.confidence);

/**
 * The fail-safe. Returns a reason when any value was read below the floor,
 * otherwise null. Rules call this before deciding pass or fail.
 */
export function uncertainReading(
  values: SourcedValue<number | string>[],
  minConfidence: number,
): string | null {
  const low = values.filter((v) => v.confidence < minConfidence);
  if (low.length === 0) return null;
  const which = [...new Set(low.map((v) => `${v.source} read at confidence ${v.confidence.toFixed(2)}`))].join(" and ");
  return `Uncertain reading: ${which}, below the ${minConfidence.toFixed(2)} minimum.`;
}

/** Confidence of a value calculated from others: no better than its weakest input. */
export const weakest = (values: SourcedValue<number | string>[]) =>
  values.reduce((min, v) => Math.min(min, v.confidence), 1);

/** Case, spacing and punctuation only. Never strips words, so "Acme Inc" and "Acme LLC" stay different. */
export const normalizeName = (s: string) =>
  s.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, "");

/** "PO-01042", "po 1042" and "1042" all become "1042". */
export const normalizePoNumber = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]+/g, "").replace(/^PO(?=\d)/, "").replace(/^0+(?=\d)/, "");

/** "INV-0889" and "inv 0889" match; "INV-889" does not, since leading zeros can be meaningful. */
export const normalizeInvoiceNumber = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "");
