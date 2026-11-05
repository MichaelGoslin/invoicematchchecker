/**
 * Applies pending migrations in db/migrations to the database in POSTGRES_URL.
 * Usage: npm run db:migrate   (reads .env.local / .env.development.local)
 */
import { getDb } from "../lib/db/client";
import { migrate } from "../lib/db/migrate";

const db = getDb();
if (!db) {
  console.error("POSTGRES_URL is not set.");
  process.exit(1);
}
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date.");
process.exit(0);
