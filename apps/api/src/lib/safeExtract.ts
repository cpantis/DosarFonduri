import { anthropic, withAILimit } from "./anthropic";

/**
 * Shared AI extraction utilities for quality guarantees across ALL pipelines.
 *
 * Provides:
 * - Truncation detection (stop_reason === "max_tokens")
 * - Continuation requests (up to MAX_CONTINUATION_ATTEMPTS)
 * - Robust JSON repair for truncated output
 * - Safe JSON parsing with multiple fallbacks
 * - Quality warning logging
 */

const MAX_CONTINUATION_ATTEMPTS = 2;

// ─── JSON REPAIR ───────────────────────────────────────────────────

/**
 * Try to repair truncated JSON by closing open arrays/objects.
 * Returns null if repair is not possible.
 */
export function repairTruncatedJSON(text: string): any | null {
  let cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Try parsing as-is first
  try { return JSON.parse(cleaned); } catch {}

  // Remove trailing comma before attempting to close
  cleaned = cleaned.replace(/,\s*$/, "");

  // Count open brackets/braces and close them
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (const ch of cleaned) {
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === "\\") { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }

  // Close unclosed structures
  // If we're inside a string, truncate to last complete entry
  if (inString) {
    const lastComplete = Math.max(cleaned.lastIndexOf("},"), cleaned.lastIndexOf("}]"));
    if (lastComplete > 0) {
      cleaned = cleaned.slice(0, lastComplete + 1);
      // Recount
      openBraces = 0; openBrackets = 0; inString = false; escapeNext = false;
      for (const ch of cleaned) {
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === "\\") { escapeNext = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") openBraces++;
        if (ch === "}") openBraces--;
        if (ch === "[") openBrackets++;
        if (ch === "]") openBrackets--;
      }
    } else {
      return null;
    }
  }

  let suffix = "";
  for (let i = 0; i < openBrackets; i++) suffix += "]";
  for (let i = 0; i < openBraces; i++) suffix += "}";

  try { return JSON.parse(cleaned + suffix); } catch { return null; }
}

// ─── SAFE JSON PARSE ───────────────────────────────────────────────

/**
 * Parse AI response text to JSON with multiple fallback strategies:
 * 1. Direct parse (after stripping backticks)
 * 2. Regex extract { ... } or [ ... ]
 * 3. Truncation repair (close unclosed brackets)
 */
export function safeJSONParse(raw: string, label: string = "unknown"): { data: any; repaired: boolean } | null {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // 1. Direct parse
  try {
    const data = JSON.parse(cleaned);
    return { data, repaired: false };
  } catch {}

  // 2. Regex extract
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return { data: JSON.parse(objMatch[0]), repaired: false };
    } catch {}
  }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return { data: JSON.parse(arrMatch[0]), repaired: false };
    } catch {}
  }

  // 3. Truncation repair
  const repaired = repairTruncatedJSON(raw);
  if (repaired !== null) {
    console.warn(`[safeJSONParse:${label}] Repaired truncated JSON (original ${raw.length} chars)`);
    return { data: repaired, repaired: true };
  }

  console.error(`[safeJSONParse:${label}] CRITICAL: All parse strategies failed. Response length: ${raw.length}, first 300 chars: "${raw.slice(0, 300)}"`);
  return null;
}

// ─── EXTRACT WITH CONTINUATION ─────────────────────────────────────

interface SafeExtractOptions {
  model: string;
  max_tokens: number;
  system: string;
  userContent: string;
  label: string;
  /** If true, use extended thinking on first call */
  extendedThinking?: { budget_tokens: number };
}

interface SafeExtractResult {
  data: any;
  repaired: boolean;
  truncated: boolean;
  continuations: number;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Make an AI extraction call with automatic truncation detection and continuation.
 *
 * If the model hits max_tokens, sends up to 2 continuation requests to get
 * the complete JSON, then repairs if needed.
 *
 * Returns parsed JSON data or null if all attempts fail.
 */
export async function extractWithContinuation(opts: SafeExtractOptions): Promise<SafeExtractResult | null> {
  const { model, max_tokens, system, userContent, label, extendedThinking } = opts;

  let totalInput = 0;
  let totalOutput = 0;
  let truncated = false;
  let continuations = 0;

  // Build initial messages
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: userContent },
  ];

  // First call
  const firstCallParams: any = {
    model,
    max_tokens,
    system,
    messages,
  };

  if (extendedThinking) {
    firstCallParams.temperature = 1;
    firstCallParams.thinking = { type: "enabled", budget_tokens: extendedThinking.budget_tokens };
  }

  const response: any = await withAILimit(() => (anthropic.messages.create as any)(firstCallParams));
  totalInput += response.usage.input_tokens;
  totalOutput += response.usage.output_tokens;

  // Extract text from response (skip thinking blocks)
  let accumulatedText = "";
  for (const block of response.content) {
    if (block.type === "text") accumulatedText += block.text;
  }

  // Check for truncation
  if (response.stop_reason === "max_tokens") {
    truncated = true;
    console.warn(`[extractWithContinuation:${label}] Truncated at ${accumulatedText.length} chars, attempting continuation...`);

    // Continuation loop
    for (let c = 0; c < MAX_CONTINUATION_ATTEMPTS; c++) {
      continuations++;

      const contMessages = [
        ...messages,
        { role: "assistant" as const, content: accumulatedText },
        { role: "user" as const, content: "JSON-ul a fost trunchiat. Continuă EXACT de unde ai rămas. NU repeta ce ai scris deja. Continuă JSON-ul:" },
      ];

      const contResponse: any = await withAILimit(() => (anthropic.messages.create as any)({
        model,
        max_tokens,
        system: system + "\n\nContinuă JSON-ul trunchiat. NU repeta ce a fost generat anterior.",
        messages: contMessages,
      }));

      totalInput += contResponse.usage.input_tokens;
      totalOutput += contResponse.usage.output_tokens;

      const contText = contResponse.content[0]?.type === "text" ? contResponse.content[0].text : "";
      accumulatedText += contText;

      console.log(`[extractWithContinuation:${label}] Continuation ${c + 1}: +${contText.length} chars (total: ${accumulatedText.length})`);

      if (contResponse.stop_reason !== "max_tokens") break;
    }
  }

  // Parse the accumulated text
  const parsed = safeJSONParse(accumulatedText, label);
  if (!parsed) return null;

  return {
    data: parsed.data,
    repaired: parsed.repaired,
    truncated,
    continuations,
    usage: { input_tokens: totalInput, output_tokens: totalOutput },
  };
}

// ─── CHUNK OVERLAP UTILITY ─────────────────────────────────────────

/**
 * Split text into chunks at page boundaries with optional overlap.
 * Page markers: "--- Pagina N ---"
 */
export function splitTextIntoChunks(
  text: string,
  charLimit: number,
  overlapPages: number = 0,
): string[] {
  if (text.length <= charLimit) return [text];

  const pageMarker = /^--- Pagina \d+/gm;
  const pageStarts: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = pageMarker.exec(text)) !== null) {
    pageStarts.push(m.index);
  }

  if (pageStarts.length <= 1) {
    // No page delimiters — split by character count with overlap
    const chunks: string[] = [];
    const step = Math.max(charLimit - 10000, charLimit / 2); // overlap ~10K chars
    for (let i = 0; i < text.length; i += step) {
      chunks.push(text.slice(i, i + charLimit));
      if (i + charLimit >= text.length) break;
    }
    return chunks;
  }

  const chunks: string[] = [];
  let chunkStartPageIdx = 0;

  for (let i = 1; i <= pageStarts.length; i++) {
    const endPos = i < pageStarts.length ? pageStarts[i] : text.length;
    const chunkText = text.slice(pageStarts[chunkStartPageIdx], endPos);

    if (chunkText.length > charLimit && chunkStartPageIdx < i - 1) {
      // Current chunk would exceed limit — emit what we have so far (excluding current page)
      const chunkEnd = pageStarts[i - 1];
      chunks.push(text.slice(pageStarts[chunkStartPageIdx], chunkEnd));

      // Start next chunk with overlap
      chunkStartPageIdx = Math.max(0, (i - 1) - overlapPages);
    } else if (i === pageStarts.length) {
      // Last page — emit remaining
      chunks.push(text.slice(pageStarts[chunkStartPageIdx], endPos));
    }
  }

  // If nothing was pushed (single massive page), push everything
  if (chunks.length === 0) {
    chunks.push(text);
  }

  return chunks;
}

// ─── QUALITY WARNING ───────────────────────────────────────────────

/**
 * Log a quality warning if extraction produced suspiciously few results
 * relative to input size.
 */
export function checkExtractionQuality(
  label: string,
  inputChars: number,
  extractedCount: number,
  minExpectedPer20K: number = 1,
): void {
  const threshold = Math.max(1, Math.floor(inputChars / 20000) * minExpectedPer20K);
  if (inputChars > 20000 && extractedCount < threshold) {
    console.warn(
      `[QUALITY WARNING:${label}] Only ${extractedCount} items extracted from ${inputChars} chars ` +
      `(expected ≥${threshold}). Possible data loss.`,
    );
  }
  if (extractedCount === 0 && inputChars > 5000) {
    console.error(
      `[CRITICAL:${label}] ZERO items extracted from ${inputChars} chars of input. ` +
      `This likely indicates a parsing failure or empty AI response.`,
    );
  }
}
