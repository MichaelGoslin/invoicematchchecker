import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../../proxy";
import { SESSION_COOKIE, sessionToken } from "./session";

const PASSCODE = "test-passcode";
const BASE = "https://imc.test";

beforeEach(() => {
  vi.stubEnv("APP_PASSCODE", PASSCODE);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

const request = (path: string, cookie?: string) =>
  new NextRequest(`${BASE}${path}`, cookie ? { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } } : undefined);

/** NextResponse.next() marks the response with this header. */
const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

// The docs call this unstable_doesProxyMatch; the installed Next still exports the older name.
describe("which paths the proxy runs on", () => {
  const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("skips only Next's static files and the favicon", () => {
    for (const url of ["/_next/static/chunks/app.js", "/_next/image", "/_next/image?url=%2Fx.png&w=64&q=75", "/favicon.ico"]) {
      expect(runsOn(url), url).toBe(false);
    }
  });

  it("runs on everything else, including paths that only start like a skipped one", () => {
    for (const url of [
      "/",
      "/login",
      "/loginx",
      "/login/docs",
      "/login.json",
      "/favicon.icox",
      "/favicon.ico/x",
      "/_next/staticx",
      "/_next/imagex",
      "/api/documents/D-1234abcd-123",
      "/api/export",
      "/batch",
    ]) {
      expect(runsOn(url), url).toBe(true);
    }
  });
});

describe("who gets through", () => {
  it("lets anyone open the login page, with or without a next path", async () => {
    expect(passedThrough(await proxy(request("/login")))).toBe(true);
    expect(passedThrough(await proxy(request("/login?next=%2Fbatch&error=1")))).toBe(true);
  });

  it("sends a signed-out visitor on a look-alike of the login path to sign in", async () => {
    for (const path of ["/loginx", "/login/docs", "/login.json", "/Login", "/"]) {
      const res = await proxy(request(path));
      expect(passedThrough(res), path).toBe(false);
      expect(getRedirectUrl(res), path).toBe(`${BASE}/login?next=${encodeURIComponent(path)}`);
    }
  });

  it("answers a signed-out API request with 401, not a redirect", async () => {
    for (const path of ["/api/documents/D-1234abcd-123", "/api/export", "/api/login"]) {
      const res = await proxy(request(path));
      expect(res.status, path).toBe(401);
    }
  });

  it("lets a signed-in reviewer through, and refuses a stale cookie", async () => {
    expect(passedThrough(await proxy(request("/api/documents/D-1234abcd-123", await sessionToken(PASSCODE))))).toBe(true);
    expect((await proxy(request("/api/documents/D-1234abcd-123", await sessionToken("old-passcode")))).status).toBe(401);
  });

  it("serves nothing, not even the login page, when production has no passcode", async () => {
    vi.stubEnv("APP_PASSCODE", "");
    for (const path of ["/login", "/"]) expect((await proxy(request(path))).status, path).toBe(503);
  });
});
