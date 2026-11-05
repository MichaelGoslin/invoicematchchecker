import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { EXTRACTION_MODEL, ExtractionError, extractDocument } from "./extract";
import { doc, n, t } from "./testDocs";

/** A stand-in for the SDK client: records the request and returns a canned response. No network. */
function fakeClient(response: Record<string, unknown>) {
  const calls: Record<string, any>[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, any>) => {
          calls.push(params);
          return {
            model: EXTRACTION_MODEL,
            stop_reason: "end_turn",
            stop_details: null,
            usage: { input_tokens: 1200, output_tokens: 800 },
            ...response,
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const parsed = doc({ document_type: "invoice", document_number: t("INV-889"), total: n(41.5, 0.97, "$41.50") });

describe("extractDocument", () => {
  it("sends the PDF with the schema, the default model and refusal fallbacks", async () => {
    const { client, calls } = fakeClient({ parsed_output: parsed });
    await extractDocument({ name: "inv-889.pdf", mediaType: "application/pdf", data: Buffer.from("%PDF-1.7") }, { client });
    const req = calls[0]!;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.output_config.effort).toBe("high");
    expect(req.output_config.format).toBeDefined();
    expect(req.messages[0].content[0]).toMatchObject({
      type: "document",
      title: "inv-889.pdf",
      source: { type: "base64", media_type: "application/pdf", data: Buffer.from("%PDF-1.7").toString("base64") },
    });
  });

  it("sends plain text as a text document", async () => {
    const { client, calls } = fakeClient({ parsed_output: parsed });
    await extractDocument({ name: "inv.txt", mediaType: "text/plain", data: "INVOICE INV-889" }, { client });
    expect(calls[0]!.messages[0].content[0].source).toEqual({ type: "text", media_type: "text/plain", data: "INVOICE INV-889" });
  });

  it("returns the guarded document, the model that answered and token usage", async () => {
    const shaky = { ...parsed, tax: n(3.39, 0.99, "$3.93") };
    const { client } = fakeClient({ parsed_output: shaky, model: "claude-opus-5" });
    const r = await extractDocument({ name: "inv.pdf", mediaType: "application/pdf", data: Buffer.from("x") }, { client });
    expect(r.document.total.confidence).toBe(0.97);
    expect(r.document.tax.confidence).toBe(0.5);
    expect(r.guardNotes).toHaveLength(1);
    expect(r.model).toBe("claude-opus-5");
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 800 });
  });

  it("throws a refusal error instead of returning an empty read", async () => {
    const { client } = fakeClient({ parsed_output: null, stop_reason: "refusal", stop_details: { category: "cyber" } });
    const p = extractDocument({ name: "x.pdf", mediaType: "application/pdf", data: Buffer.from("x") }, { client });
    await expect(p).rejects.toBeInstanceOf(ExtractionError);
    await expect(p).rejects.toMatchObject({ reason: "refusal", documentName: "x.pdf" });
  });

  it("throws when the output was cut off", async () => {
    const { client } = fakeClient({ parsed_output: null, stop_reason: "max_tokens" });
    await expect(
      extractDocument({ name: "x.pdf", mediaType: "application/pdf", data: Buffer.from("x") }, { client }),
    ).rejects.toMatchObject({ reason: "truncated" });
  });

  it("throws when no valid JSON came back", async () => {
    const { client } = fakeClient({ parsed_output: null });
    await expect(
      extractDocument({ name: "x.pdf", mediaType: "application/pdf", data: Buffer.from("x") }, { client }),
    ).rejects.toMatchObject({ reason: "unparseable" });
  });
});
