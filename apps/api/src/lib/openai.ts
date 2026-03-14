/**
 * Shared OpenAI client for GPT-4o Vision OCR.
 *
 * Used exclusively for OCR of scanned PDF pages — native text
 * extraction is handled by PyMuPDF (free, <100ms).
 */
import OpenAI from "openai";

let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not set — cannot use OpenAI services");
    }
    _openai = new OpenAI({ maxRetries: 3 });
  }
  return _openai;
}

/** @deprecated Use getOpenAI() instead — kept for backward compat */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAI() as any)[prop];
  },
});
