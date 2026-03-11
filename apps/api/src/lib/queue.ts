import { Queue } from "bullmq";
import { redis } from "./redis";

// BullMQ expects an ioredis-compatible connection. The type mismatch between
// standalone ioredis and BullMQ's bundled version is cosmetic — the API is identical.
const conn = redis as Parameters<typeof Queue.prototype.add>[0] extends never ? any : typeof redis;

export const processGuideQueue = new Queue("process-guide", { connection: conn as any });
export const processTemplateQueue = new Queue("process-template", { connection: conn as any });
export const processReferenceDataQueue = new Queue("process-reference-data", { connection: conn as any });
export const syncOnrcQueue = new Queue("sync-onrc", { connection: conn as any });

// Attach error handlers to prevent unhandled rejections
for (const q of [processGuideQueue, processTemplateQueue, processReferenceDataQueue, syncOnrcQueue]) {
  q.on("error", (err) => {
    console.error(`Queue "${q.name}" error:`, err.message);
  });
}
