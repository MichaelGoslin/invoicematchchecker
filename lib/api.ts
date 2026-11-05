/** Small helpers shared by the API route handlers. */
import { getDb } from "./db/client";
import type { Db } from "./db/db";

export const jsonError = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status });

/** The database, or a 503 response explaining that this needs one. */
export function requireDb(): Db | Response {
  return getDb() ?? jsonError("No database is configured, so this can't be saved.", 503);
}

/** Reads a JSON body, or null if it isn't valid JSON. */
export async function readJson<T extends Record<string, unknown>>(request: Request): Promise<Partial<T> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Partial<T>) : null;
  } catch {
    return null;
  }
}

export const actorFrom = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");
