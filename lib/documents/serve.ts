/**
 * Serves the uploaded file behind a document, so a reviewer can open the
 * invoice, PO or receiving report from the queue.
 *
 * The file came from whoever uploaded it, so it is served as exactly the type
 * it was stored as and never as something a browser would run:
 * - the passcode is checked here as well as in proxy.ts, before any lookup, so
 *   a gap in the proxy matcher can't expose files;
 * - only ids shaped like the ones the app makes are looked up;
 * - nosniff stops a browser from treating a disguised file as HTML;
 * - text files are sandboxed (no scripts, no same-origin access). PDFs and
 *   images aren't, because Chrome won't show a PDF in a sandboxed response;
 * - nothing is cached, so a file isn't left behind in a shared browser or proxy.
 */
import { gateMode, isValidSession } from "../auth/session";
import { getDocumentFile } from "../db/batches";
import type { Db } from "../db/db";

/** The shape newDocumentId() makes: D- and the first 12 characters of a UUID. */
export const DOCUMENT_ID = /^D-[0-9a-f]{8}-[0-9a-f]{3}$/;

const NOT_FOUND = "No file is stored for this document.";

const json = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "cache-control": "private, no-store" } });

/**
 * A Content-Disposition value that can't break the header: a plain-ASCII
 * fallback name plus the real name percent-encoded (RFC 6266 / 5987).
 */
export function contentDisposition(fileName: string, disposition: "inline" | "attachment" = "inline"): string {
  const cleaned = fileName.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "document";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export interface ServeOptions {
  /** The imc_session cookie value from the request. */
  session: string | undefined;
  env?: { APP_PASSCODE?: string; NODE_ENV?: string };
}

export async function serveDocument(db: Db | null, id: string, { session, env = process.env }: ServeOptions): Promise<Response> {
  const mode = gateMode(env);
  if (mode === "misconfigured") return json("APP_PASSCODE is not set for this deployment.", 503);
  if (mode === "on" && !(await isValidSession(session, env.APP_PASSCODE!))) return json("Sign in required.", 401);

  if (!DOCUMENT_ID.test(id)) return json(NOT_FOUND, 404);
  if (!db) return json("No database is configured, so there are no stored files.", 503);

  const file = await getDocumentFile(db, id);
  if (!file) return json(NOT_FOUND, 404);

  const headers: Record<string, string> = {
    "content-type": file.mediaType === "text/plain" ? "text/plain; charset=utf-8" : file.mediaType,
    "content-length": String(file.data.length),
    "content-disposition": contentDisposition(file.fileName),
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "x-frame-options": "SAMEORIGIN",
  };
  if (file.mediaType === "text/plain") headers["content-security-policy"] = "sandbox; default-src 'none'";

  return new Response(new Uint8Array(file.data), { status: 200, headers });
}
