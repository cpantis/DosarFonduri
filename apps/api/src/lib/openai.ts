/**
 * Shared OpenAI client for GPT-4o Vision OCR.
 *
 * Used exclusively for OCR of scanned PDF pages — native text
 * extraction is handled by PyMuPDF (free, <100ms).
 */
import OpenAI from "openai";

const openai = new OpenAI({
  maxRetries: 3,
});

export { openai };
