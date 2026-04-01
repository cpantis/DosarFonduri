/**
 * Shared Anthropic client pool with round-robin key rotation + priority queue.
 *
 * Supports multiple API keys via ANTHROPIC_API_KEYS (comma-separated).
 * Priority lanes: "interactive" (Solomon chat) always runs before "batch" (guide processing, OCR).
 * Queue timeout prevents users from waiting indefinitely.
 */
import Anthropic from "@anthropic-ai/sdk";

// ─── Build client pool from environment ───

function buildClients(): Anthropic[] {
  const multiKeys = process.env.ANTHROPIC_API_KEYS;
  if (multiKeys) {
    const keys: string[] = multiKeys.split(",").map((k: string) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      console.log(`[anthropic] Initialized ${keys.length} API key(s) for round-robin rotation`);
      return keys.map((apiKey: string) => new Anthropic({ apiKey, maxRetries: 6 }));
    }
  }
  console.log("[anthropic] Using single ANTHROPIC_API_KEY");
  return [new Anthropic({ maxRetries: 6 })];
}

const clients = buildClients();
let roundRobinIndex = 0;

const anthropic: Anthropic = new Proxy(clients[0], {
  get(_target, prop, receiver) {
    const client = clients[roundRobinIndex % clients.length];
    roundRobinIndex = (roundRobinIndex + 1) % clients.length;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { anthropic };

// ─── Priority concurrency limiter ───

const MAX_CONCURRENT_AI_CALLS = parseInt(
  process.env.MAX_CONCURRENT_AI_CALLS || "10",
  10,
);

/** Queue timeout — max time to wait for a slot (ms) */
const QUEUE_TIMEOUT_MS = parseInt(
  process.env.AI_QUEUE_TIMEOUT_MS || "30000",
  10,
);

export type AIPriority = "interactive" | "batch";

interface QueueEntry {
  resolve: () => void;
  reject: (err: Error) => void;
  priority: AIPriority;
  enqueuedAt: number;
}

let activeCalls = 0;
const highQueue: QueueEntry[] = []; // interactive (Solomon, eligibility check)
const lowQueue: QueueEntry[] = [];  // batch (guide processing, OCR, Neemia)

function releaseNext() {
  // Interactive tasks always go first
  const next = highQueue.shift() || lowQueue.shift();
  if (next) next.resolve();
}

console.log(`[anthropic] Concurrency: max=${MAX_CONCURRENT_AI_CALLS}, queue_timeout=${QUEUE_TIMEOUT_MS}ms, keys=${clients.length}`);

/**
 * Wraps an async AI call with priority-based concurrency limiting.
 *
 * @param fn - The AI call to execute
 * @param priority - "interactive" (Solomon, user-facing) or "batch" (guide, OCR, Neemia)
 *
 * Interactive calls jump ahead of batch calls in the queue.
 * Throws after QUEUE_TIMEOUT_MS if no slot becomes available.
 */
export async function withAILimit<T>(fn: () => Promise<T>, priority: AIPriority = "batch"): Promise<T> {
  if (activeCalls >= MAX_CONCURRENT_AI_CALLS) {
    const queue = priority === "interactive" ? highQueue : lowQueue;

    await new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject, priority, enqueuedAt: Date.now() };
      queue.push(entry);

      // Timeout: don't wait forever
      const timer = setTimeout(() => {
        // Remove from queue
        const idx = queue.indexOf(entry);
        if (idx !== -1) queue.splice(idx, 1);
        console.warn(`[anthropic] Queue timeout: ${QUEUE_TIMEOUT_MS}ms, priority=${priority}, active=${activeCalls}, highQ=${highQueue.length}, lowQ=${lowQueue.length}`);
        reject(new Error("Sistemul AI este ocupat momentan. Reîncearcă peste câteva secunde."));
      }, QUEUE_TIMEOUT_MS);

      // Clear timeout when resolved
      const origResolve = entry.resolve;
      entry.resolve = () => {
        clearTimeout(timer);
        origResolve();
      };
    });
  }

  activeCalls++;
  try {
    return await fn();
  } finally {
    activeCalls--;
    releaseNext();
  }
}

/**
 * Acquire a concurrency slot for long-running operations (streaming).
 * Returns a release function that MUST be called when done.
 * Throws on timeout.
 */
export async function acquireAISlot(priority: AIPriority = "interactive"): Promise<() => void> {
  if (activeCalls >= MAX_CONCURRENT_AI_CALLS) {
    const queue = priority === "interactive" ? highQueue : lowQueue;
    await new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject, priority, enqueuedAt: Date.now() };
      queue.push(entry);
      const timer = setTimeout(() => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) queue.splice(idx, 1);
        reject(new Error(`AI slot timeout (${QUEUE_TIMEOUT_MS}ms, priority=${priority})`));
      }, QUEUE_TIMEOUT_MS);
      const origResolve = entry.resolve;
      entry.resolve = () => { clearTimeout(timer); origResolve(); };
    });
  }
  activeCalls++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeCalls--;
    releaseNext();
  };
}

/** Number of API keys in the pool */
export const keyCount = clients.length;

/** Current queue stats (for monitoring) */
export function getAIQueueStats() {
  return {
    activeCalls,
    maxConcurrent: MAX_CONCURRENT_AI_CALLS,
    highQueueLength: highQueue.length,
    lowQueueLength: lowQueue.length,
    keys: clients.length,
  };
}
