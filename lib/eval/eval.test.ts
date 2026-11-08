import { describe, expect, it } from "vitest";
import { n } from "../extract/testDocs";
import { scoreAnswerKey } from "../match/answerKey";
import { sameValue } from "./fields";
import { formatReport, summarize } from "./report";
import { runEval } from "./run";
import { type Tamper, truthReader } from "./truthReader";

describe("evaluation with a perfect reader", () => {
  it("scores every field right and every set the same as the printed-values score", async () => {
    const result = await runEval({ extract: truthReader() });
    const s = summarize(result);

    expect(s.sets).toBe(100);
    expect(s.documentsRead).toBe(295); // 100 invoices, 97 POs (3 sets have none), 98 receiving reports (2 have none)
    expect(s.confidentMisreads).toEqual([]);
    expect(s.falseApprovals).toEqual([]);
    expect(s.decisionFields.accuracy).toBe(1);
    expect(s.fields.byOutcome.not_extracted).toBe(100); // subtotal: not in the extraction schema

    // Reading perfectly must give exactly the printed-values result.
    const printed = new Map(scoreAnswerKey().map((x) => [x.setId, x.engine]));
    for (const set of result.sets) expect(set.engine).toEqual(printed.get(set.setId));
  });
});

describe("planted misreads", () => {
  // S-034 bills one line 7.47% over the PO price. If Claude confidently misreads that
  // PO price as the invoice's, the price check passes: nothing on the invoice is wrong,
  // so no other check notices, and the set can be recommended for approval.
  const s034 = "S-034";

  it("reports a confident misread that turns into a false approval", async () => {
    const invoicePrices = new Map<number, number | null>();
    const learn: Tamper = (setId, role, d) => {
      if (setId === s034 && role === "invoice") for (const l of d.lines) invoicePrices.set(l.line_number, l.unit_price.value);
      return d;
    };
    await runEval({ extract: truthReader(undefined, learn), setIds: [s034] });
    const misread: Tamper = (setId, role, d) =>
      setId !== s034 || role !== "po"
        ? d
        : { ...d, lines: d.lines.map((l) => ({ ...l, unit_price: n(invoicePrices.get(l.line_number) ?? null, 0.97) })) };

    const result = await runEval({ extract: truthReader(undefined, misread), setIds: [s034] });
    const s = summarize(result);
    expect(result.sets[0]!.key.outcome).toBe("review");
    expect(s.falseApprovals).toEqual([s034]);
    expect(s.confidentMisreads).toEqual([
      expect.objectContaining({ setId: s034, document: "po", field: "unit_price", decisionField: true, confidence: 0.97 }),
    ]);
    expect(formatReport(s, result)).toContain(`False approvals: 1  ← ${s034}`);
  });

  it("counts a low-confidence misread as caught, and the set goes to a person", async () => {
    const shaky: Tamper = (setId, role, d) =>
      setId === "S-002" && role === "invoice" ? { ...d, total: n((d.total.value ?? 0) + 10, 0.6) } : d;
    const result = await runEval({ extract: truthReader(undefined, shaky), setIds: ["S-002"] });
    const s = summarize(result);
    expect(s.confidentMisreads).toEqual([]);
    expect(s.decisionFields.byOutcome.caught).toBe(1);
    expect(result.sets[0]!.engine).toMatchObject({ outcome: "review", reason: "gated" });
    expect(s.extraReviews).toEqual(["S-002"]);
    expect(s.falseApprovals).toEqual([]);
  });

  it("treats a document that can't be read as a set for a person, never an approval", async () => {
    const failing = truthReader();
    const extract: typeof failing = async (input) => {
      if (input.name === "S-002-invoice.pdf") throw new Error("declined");
      return failing(input);
    };
    const result = await runEval({ extract, setIds: ["S-002"] });
    expect(result.sets[0]!.engine).toMatchObject({ outcome: "review", reason: "unreadable" });
    expect(result.sets[0]!.problems[0]).toContain("declined");
  });

  it("reuses cached readings instead of reading again", async () => {
    const store = new Map();
    const cache = { get: (k: string) => store.get(k), set: (k: string, v: unknown) => void store.set(k, v) };
    let calls = 0;
    const base = truthReader();
    const extract: typeof base = async (input) => {
      calls++;
      return base(input);
    };
    await runEval({ extract, setIds: ["S-002"], cache });
    const second = await runEval({ extract, setIds: ["S-002"], cache });
    expect(calls).toBe(3);
    expect(second.fromCache).toBe(3);
  });
});

describe("value comparison", () => {
  it("compares ids, names, dates and numbers the way the engine would", () => {
    expect(sameValue("id", "PO 7267", "PO-7267")).toBe(true);
    expect(sameValue("name", "HARBOR POINT SUPPLY CO", "Harbor Point Supply Co.")).toBe(true);
    expect(sameValue("date", "10/29/2026", "2026-10-29")).toBe(true);
    expect(sameValue("date", "October 29, 2026", "2026-10-29")).toBe(true);
    expect(sameValue("number", 1078.8, "1078.80")).toBe(true);
    expect(sameValue("number", 1078.8, "1078.08")).toBe(false);
    expect(sameValue("id", "PO-7276", "PO-7267")).toBe(false);
  });
});
