/**
 * Reads one document (PDF, image or plain text) into structured JSON with a
 * confidence score per field. Server-side only: it uses ANTHROPIC_API_KEY.
 *
 * Claude only reads. It never decides a match: the rules in lib/match do that.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { guardDocument } from "./guard";
import { ExtractedDocumentSchema, type ExtractedDocument } from "./schema";

export const EXTRACTION_MODEL = "claude-opus-5-5";
export const EXTRACTION_PROMPT_VERSION = "1";

export type DocumentMediaType = "application/pdf" | "image/png" | "image/jpeg" | "text/plain";

export interface DocumentInput {
  /** File name, for error messages and the audit log. */
  name: string;
  mediaType: DocumentMediaType;
  /** Raw file bytes, or the text itself for text/plain. */
  data: Buffer | string;
}

export interface ExtractOptions {
  client?: Anthropic;
  /** Reading accuracy matters more than cost here. Default "high". */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface ExtractionResult {
  name: string;
  document: ExtractedDocument;
  /** Fields whose confidence the code lowered, and why. */
  guardNotes: string[];
  /** Which model actually answered (differs from EXTRACTION_MODEL if a fallback ran). */
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number };
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly reason: "refusal" | "truncated" | "unparseable",
    readonly documentName: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

const SYSTEM_PROMPT = `You read accounts-payable documents (purchase orders, receiving reports and vendor invoices) and transcribe them into the requested JSON.

Your output feeds an automated matching check that decides whether a payment is recommended, so a wrong number can become a wrong payment. Transcribe exactly what is printed; never calculate, correct, round or fill in a value that is not shown. If a value is missing or you cannot read it with certainty, return null or a low confidence rather than a best guess. A low confidence sends the document to a person, which is the safe outcome.

For every field, quote the exact characters you read in evidence and give the page number.`;

function contentBlock(input: DocumentInput): Anthropic.Beta.BetaContentBlockParam {
  const base64 = () => (typeof input.data === "string" ? Buffer.from(input.data) : input.data).toString("base64");
  switch (input.mediaType) {
    case "application/pdf":
      return { type: "document", title: input.name, source: { type: "base64", media_type: "application/pdf", data: base64() } };
    case "text/plain":
      return {
        type: "document",
        title: input.name,
        source: { type: "text", media_type: "text/plain", data: typeof input.data === "string" ? input.data : input.data.toString("utf8") },
      };
    case "image/png":
    case "image/jpeg":
      return { type: "image", source: { type: "base64", media_type: input.mediaType, data: base64() } };
  }
}

export async function extractDocument(input: DocumentInput, options: ExtractOptions = {}): Promise<ExtractionResult> {
  const client = options.client ?? new Anthropic();

  const response = await client.beta.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // If a safety classifier declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: options.effort ?? "high", format: betaZodOutputFormat(ExtractedDocumentSchema) },
    messages: [
      {
        role: "user",
        content: [contentBlock(input), { type: "text", text: "Transcribe this document." }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError(
      `Extraction of ${input.name} was declined (${response.stop_details?.category ?? "no category"}).`,
      "refusal",
      input.name,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError(`Extraction of ${input.name} was cut off before it finished.`, "truncated", input.name);
  }
  if (!response.parsed_output) {
    throw new ExtractionError(`Extraction of ${input.name} did not return valid JSON.`, "unparseable", input.name);
  }

  const { document, notes } = guardDocument(response.parsed_output);
  return {
    name: input.name,
    document,
    guardNotes: notes,
    model: response.model,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
