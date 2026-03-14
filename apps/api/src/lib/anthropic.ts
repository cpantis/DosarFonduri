/**
 * Shared Anthropic client with rate-limit-aware retry.
 *
 * The default Anthropic SDK retries 429s twice. This wrapper adds:
 * - Configurable maxRetries (default 4 for more breathing room)
 * - A simple token-bucket style concurrency limiter so we don't
 *   blast the API with too many parallel requests.
 */
import Anthropic from "@anthropic-ai/sdk";

// Single shared client — the SDK is stateless and thread-safe
const anthropic = new Anthropic({
  maxRetries: 4, // 429 retry: ~2s, 4s, 8s, 16s exponential backoff
});

export { anthropic };

// ─── Concurrency limiter for AI calls ───

const MAX_CONCURRENT_AI_CALLS = parseInt(process.env.MAX_CONCURRENT_AI_CALLS || "3", 10);

let activeCalls = 0;
const waitQueue: Array<() => void> = [];

/**
 * Wraps an async AI call with concurrency limiting.
 * At most MAX_CONCURRENT_AI_CALLS run simultaneously across all workers/services.
 */
export async function withAILimit<T>(fn: () => Promise<T>): Promise<T> {
  // Wait for a slot
  if (activeCalls >= MAX_CONCURRENT_AI_CALLS) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  activeCalls++;
  try {
    return await fn();
  } finally {
    activeCalls--;
    // Release next waiter
    const next = waitQueue.shift();
    if (next) next();
  }
}
