/**
 * Shared Anthropic client pool with round-robin key rotation.
 *
 * Supports multiple API keys for higher aggregate rate limits.
 * Set ANTHROPIC_API_KEY for a single key, or ANTHROPIC_API_KEYS (comma-separated)
 * for round-robin rotation across multiple keys.
 *
 * The exported `anthropic` object is a Proxy that rotates across all clients
 * automatically — no changes needed in consuming code.
 */
import Anthropic from "@anthropic-ai/sdk";

// ─── Build client pool from environment ───

function buildClients(): Anthropic[] {
  const multiKeys = process.env.ANTHROPIC_API_KEYS;
  if (multiKeys) {
    const keys: string[] = multiKeys.split(",").map((k: string) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      console.log(`[anthropic] Initialized ${keys.length} API key(s) for round-robin rotation`);
      return keys.map((apiKey: string) => new Anthropic({ apiKey, maxRetries: 4 }));
    }
  }

  // Fallback: single ANTHROPIC_API_KEY (SDK reads it automatically)
  console.log("[anthropic] Using single API key");
  return [new Anthropic({ maxRetries: 4 })];
}

const clients = buildClients();
let roundRobinIndex = 0;

/**
 * Proxy that delegates every property access to the next client in rotation.
 * This means `anthropic.messages.create(...)` automatically uses a different
 * API key each time — zero changes needed in consuming code.
 */
const anthropic: Anthropic = new Proxy(clients[0], {
  get(_target, prop, receiver) {
    const client = clients[roundRobinIndex % clients.length];
    roundRobinIndex = (roundRobinIndex + 1) % clients.length;
    const value = Reflect.get(client, prop, receiver);
    // Bind methods so `this` points to the rotated client
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { anthropic };

// ─── Concurrency limiter for AI calls ───

const MAX_CONCURRENT_AI_CALLS = parseInt(
  process.env.MAX_CONCURRENT_AI_CALLS || String(clients.length * 3),
  10,
);

let activeCalls = 0;
const waitQueue: Array<() => void> = [];

/**
 * Wraps an async AI call with concurrency limiting.
 * At most MAX_CONCURRENT_AI_CALLS run simultaneously.
 */
export async function withAILimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCalls >= MAX_CONCURRENT_AI_CALLS) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  activeCalls++;
  try {
    return await fn();
  } finally {
    activeCalls--;
    const next = waitQueue.shift();
    if (next) next();
  }
}

/** Number of API keys in the pool */
export const keyCount = clients.length;
