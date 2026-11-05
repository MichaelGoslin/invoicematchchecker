/** An in-memory Postgres (PGlite) behind the same Db interface, migrated, for tests. */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Db } from "./db";
import { migrate } from "./migrate";

function wrap(pg: PGlite | Transaction): Db {
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    transaction: <R>(fn: (tx: Db) => Promise<R>) => {
      if (!("transaction" in pg)) throw new Error("Nested transactions are not supported.");
      return (pg as PGlite).transaction((tx) => fn(wrap(tx)));
    },
  };
}

export async function createTestDb(): Promise<Db> {
  const db = wrap(new PGlite());
  await migrate(db);
  return db;
}
