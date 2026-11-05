/**
 * Shared-passcode gate for the deployed app. The cookie holds an HMAC of the
 * passcode, never the passcode itself; changing APP_PASSCODE signs everyone out.
 * Uses Web Crypto so it runs in proxy.ts and in server actions alike.
 */

export const SESSION_COOKIE = "imc_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** open-dev: no passcode set outside production, so local dev is not gated. */
export type GateMode = "on" | "open-dev" | "misconfigured";

export function gateMode(env: { APP_PASSCODE?: string; NODE_ENV?: string } = process.env): GateMode {
  if (env.APP_PASSCODE) return "on";
  // Fail closed: a production deploy without a passcode serves nothing.
  return env.NODE_ENV === "production" ? "misconfigured" : "open-dev";
}

const encoder = new TextEncoder();

export async function sessionToken(passcode: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(passcode), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode("invoicematchchecker-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares without exiting early, so timing doesn't reveal how much matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined, passcode: string): Promise<boolean> {
  if (!cookieValue) return false;
  return constantTimeEqual(cookieValue, await sessionToken(passcode));
}

/** Only same-site relative paths, so the login form can't be used as an open redirect. */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
