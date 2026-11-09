import { describe, expect, it } from "vitest";
import { decisionBlockedReason, NEED_NAME } from "./decisionHints";

describe("decisionBlockedReason", () => {
  it("asks for a name before anything else, treating blanks as missing", () => {
    expect(decisionBlockedReason("approve", "approve", "", "")).toBe(NEED_NAME);
    expect(decisionBlockedReason("reject", "review", "   ", "a reason")).toBe(NEED_NAME);
  });

  it("lets a person follow the recommendation with just a name", () => {
    expect(decisionBlockedReason("approve", "approve", "Joan", "")).toBeNull();
    expect(decisionBlockedReason("reject", "reject", "Joan", "")).toBeNull();
    expect(decisionBlockedReason("reject", "review", "Joan", "")).toBeNull();
  });

  it("asks for a reason when going against the engine, and says which way", () => {
    expect(decisionBlockedReason("approve", "review", "Joan", "")).toBe("The engine said this set needs review. To approve it anyway, choose a reason code or write a note.");
    expect(decisionBlockedReason("approve", "reject", "Joan", "  ")).toMatch(/recommended rejecting this set\. To approve it anyway/);
    expect(decisionBlockedReason("reject", "approve", "Joan", "")).toMatch(/recommended approving this set\. To reject it anyway/);
  });

  it("is satisfied once there is a reason", () => {
    expect(decisionBlockedReason("approve", "review", "Joan", "Price change agreed with the buyer")).toBeNull();
  });
});
