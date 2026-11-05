import { describe, expect, it } from "vitest";
import { constantTimeEqual, gateMode, isValidSession, safeNextPath, sessionToken } from "./session";

describe("passcode gate", () => {
  it("fails closed in production when no passcode is set", () => {
    expect(gateMode({ NODE_ENV: "production" })).toBe("misconfigured");
    expect(gateMode({ NODE_ENV: "development" })).toBe("open-dev");
    expect(gateMode({ NODE_ENV: "production", APP_PASSCODE: "x" })).toBe("on");
  });

  it("accepts the cookie made from the current passcode only", async () => {
    const token = await sessionToken("blue-harbor");
    expect(await isValidSession(token, "blue-harbor")).toBe(true);
    expect(await isValidSession(token, "new-passcode")).toBe(false);
    expect(await isValidSession(undefined, "blue-harbor")).toBe(false);
  });

  it("never stores the passcode itself in the cookie", async () => {
    expect(await sessionToken("blue-harbor")).not.toContain("blue-harbor");
  });

  it("compares strings of different lengths safely", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  it("only redirects to same-site paths after sign-in", () => {
    expect(safeNextPath("/queue?x=1")).toBe("/queue?x=1");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
