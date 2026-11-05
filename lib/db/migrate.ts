/** Applies db/migrations/*.sql in name order, once each, recording them in schema_migrations. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "./db";

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  // Keep it out of Supabase's public REST API, like the app tables.
  await db.query("alter table schema_migrations enable row level security");
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    const sqlText = readFileSync(path.join(dir, name), "utf8");
    await db.transaction(async (tx) => {
      await runScript(tx, sqlText);
      await tx.query("insert into schema_migrations (name) values ($1)", [name]);
    });
    applied.push(name);
  }
  return applied;
}

/** Splits a migration into statements, keeping $$-quoted function bodies intact. */
export function splitStatements(sqlText: string): string[] {
  const out: string[] = [];
  let current = "";
  let inDollar = false;
  for (const line of sqlText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!inDollar && (trimmed.startsWith("--") || trimmed === "")) continue;
    current += `${line}\n`;
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && trimmed.endsWith(";")) {
      out.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

async function runScript(db: Db, sqlText: string) {
  for (const statement of splitStatements(sqlText)) await db.query(statement);
}
