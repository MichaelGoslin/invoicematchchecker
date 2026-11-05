/**
 * The narrow database surface the app uses: parameterized queries and
 * transactions. Production wraps postgres.js (Supabase); tests wrap PGlite.
 * Always pass values as $1, $2… parameters, never by building SQL strings. Pass
 * jsonb values as plain objects: both drivers serialize them, so stringifying first
 * would store a JSON string instead of an object.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}
