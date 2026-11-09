/**
 * GET /api/documents/:id
 *
 * The uploaded file behind a document, shown in the browser. All the checks
 * live in serveDocument; see lib/documents/serve.ts.
 */
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { serveDocument } from "@/lib/documents/serve";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The passcode is checked before getDb is used, inside serveDocument.
  return serveDocument(getDb(), id, { session: request.cookies.get(SESSION_COOKIE)?.value });
}
