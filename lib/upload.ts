/** Checks an uploaded file and turns it into extractor input. Shared by the single-set and batch routes. */
import type { DocumentInput, DocumentMediaType } from "./extract/extract";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MEDIA_TYPES: Record<string, DocumentMediaType> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "text/plain": "text/plain",
};

const BY_EXTENSION: Record<string, DocumentMediaType> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
};

export class UploadError extends Error {}

export async function readUpload(value: FormDataEntryValue | null, field: string): Promise<DocumentInput | null> {
  if (value === null) return null;
  if (!(value instanceof File)) throw new UploadError(`${field} must be a file.`);
  const ext = value.name.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? "";
  const mediaType = MEDIA_TYPES[value.type] ?? BY_EXTENSION[ext];
  if (!mediaType) throw new UploadError(`${value.name} is ${value.type || "an unknown type"}; upload a PDF, PNG, JPEG or .txt file.`);
  if (value.size === 0) throw new UploadError(`${value.name} is empty.`);
  if (value.size > MAX_UPLOAD_BYTES) throw new UploadError(`${value.name} is over 20 MB.`);
  return { name: value.name.slice(0, 200), mediaType, data: Buffer.from(await value.arrayBuffer()) };
}
