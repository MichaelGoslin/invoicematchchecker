/**
 * Production database client (Supabase Postgres via POSTGRES_URL). Server-only.
 * Returns null when no database is configured, so callers can fall back safely.
 */
import postgres from "postgres";
import type { Db } from "./db";

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql): Db {
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    transaction: <R>(fn: (tx: Db) => Promise<R>) => {
      if (!("begin" in sql)) throw new Error("Nested transactions are not supported.");
      return (sql as postgres.Sql).begin((tx) => fn(wrap(tx))) as Promise<R>;
    },
  };
}

const globalForDb = globalThis as unknown as { __imcDb?: Db };

export function getDb(env: Record<string, string | undefined> = process.env): Db | null {
  if (!env.POSTGRES_URL) return null;
  if (!globalForDb.__imcDb) {
    // Supabase's pooler (port 6543) runs in transaction mode, which can't hold prepared statements.
    // POSTGRES_POOL_MAX: optional; 1 suits single-session test servers such as PGlite.
    const max = Number(env.POSTGRES_POOL_MAX) || 5;
    const sql = postgres(env.POSTGRES_URL, { prepare: false, max, idle_timeout: 20, onnotice: () => {} });
    globalForDb.__imcDb = wrap(sql);
  }
  return globalForDb.__imcDb;
}
