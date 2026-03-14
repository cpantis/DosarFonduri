import { Queue } from "bullmq";
import { redis } from "./redis";

// BullMQ expects an ioredis-compatible connection. The type mismatch between
// standalone ioredis and BullMQ's bundled version is cosmetic — the API is identical.
const conn = redis as Parameters<typeof Queue.prototype.add>[0] extends never ? any : typeof redis;

// Default job options with exponential backoff retry
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 5000, // 5s initial, then 10s, 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
};

export const processGuideQueue = new Queue("process-guide", {
  connection: conn as any,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
export const processTemplateQueue = new Queue("process-template", {
  connection: conn as any,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
export const processReferenceDataQueue = new Queue("process-reference-data", {
  connection: conn as any,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
export const processClientDocQueue = new Queue("process-client-doc", {
  connection: conn as any,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
export const processCompanyQueue = new Queue("process-company", {
  connection: conn as any,
  defaultJobOptions: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 4,
    backoff: { type: "exponential" as const, delay: 8000 }, // 8s, 16s, 32s, 64s — AI calls need more breathing room
  },
});
export const syncOnrcQueue = new Queue("sync-onrc", {
  connection: conn as any,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

// Job priority constants (lower number = higher priority)
export const JOB_PRIORITY = {
  GUIDE: 1,        // Ghidul deblochează restul fluxului
  TEMPLATE: 2,     // Template-urile sunt necesare pentru generare
  COMPANY: 3,      // ONRC/bilanț — deblochează eligibilitatea
  REFERENCE_DATA: 4,
  CLIENT_DOC: 5,   // Documente client — procesare normală
} as const;

// Attach error handlers to prevent unhandled rejections
for (const q of [processGuideQueue, processTemplateQueue, processReferenceDataQueue, processClientDocQueue, processCompanyQueue, syncOnrcQueue]) {
  q.on("error", (err) => {
    console.error(`Queue "${q.name}" error:`, err.message);
  });
}
