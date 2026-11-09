import { describe, expect, it } from "vitest";
import { approveBlockedReason, approvedMessage, approveLabel, exportBlockedReason, exportLabel, readyLine } from "./bulkHints";

describe("bulk action labels", () => {
  it("shows the count when there is something to do", () => {
    expect(approveLabel(3)).toBe("Approve all 3 clean");
    expect(exportLabel(2)).toBe("Export 2 approved");
  });
  it("drops the count when there is nothing", () => {
    expect(approveLabel(0)).toBe("Approve all clean");
    expect(exportLabel(0)).toBe("Export approved");
  });
});

describe("why a button is off", () => {
  it("explains an empty group before asking for a name", () => {
    expect(approveBlockedReason(0, "")).toBe("No clean sets are waiting.");
    expect(exportBlockedReason(0, "Joan")).toBe("Nothing approved is waiting to be exported.");
  });
  it("asks for a name, treating blanks as missing", () => {
    expect(approveBlockedReason(2, "   ")).toMatch(/Enter your name/);
    expect(exportBlockedReason(2, "")).toMatch(/Enter your name/);
  });
  it("returns null when the button can be used", () => {
    expect(approveBlockedReason(2, "Joan")).toBeNull();
    expect(exportBlockedReason(1, "Joan")).toBeNull();
  });
});

describe("messages", () => {
  it("says what is ready, with correct plurals", () => {
    expect(readyLine(1, 0)).toBe("1 clean set ready to approve · 0 approved sets ready to export");
    expect(readyLine(2, 1)).toBe("2 clean sets ready to approve · 1 approved set ready to export");
  });
  it("reports approvals and any skipped sets", () => {
    expect(approvedMessage(1)).toBe("Approved 1 clean set.");
    expect(approvedMessage(3, 1)).toBe("Approved 3 clean sets. 1 set had already been decided by someone else and was left alone.");
    expect(approvedMessage(2, 2)).toMatch(/2 sets had already been decided .* were left alone/);
  });
});
