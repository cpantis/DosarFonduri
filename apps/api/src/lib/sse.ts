import { redis, isRedisReady } from "./redis";
import type Redis from "ioredis";

/**
 * Publish an SSE event via Redis pub/sub.
 * Channel convention: `{scope}:{id}:updates`
 * e.g. `project:uuid:updates`, `org:uuid:uploads`
 */
export async function publishEvent(
  channel: string,
  event: string,
  data: Record<string, any>,
): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.publish(channel, JSON.stringify({ event, data, ts: Date.now() }));
  } catch {
    // Non-critical — SSE is best-effort
  }
}

/** Shortcut for organization-scoped upload events */
export function publishUploadEvent(
  organizationId: string,
  data: {
    documentId: string;
    documentName: string;
    status: string;
    processingType: string;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `org:${organizationId}:uploads`,
    "document_uploaded",
    data,
  );
}

/** Element validated event — pushes to project channel */
export function publishElementValidated(
  projectId: string,
  data: {
    elementId: string;
    elementKey: string;
    value: string | null;
    validationStatus: string;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `project:${projectId}:updates`,
    "element_validated",
    data,
  );
}

/** Eligibility re-evaluated event */
export function publishEligibilityUpdated(
  projectId: string,
  data: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `project:${projectId}:updates`,
    "eligibility_updated",
    data,
  );
}

/** Score recalculated event */
export function publishScoreUpdated(
  projectId: string,
  data: {
    totalPoints: number;
    maxTotalPoints: number;
    percentage: number;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `project:${projectId}:updates`,
    "score_updated",
    data,
  );
}

/** Per-field extraction event — streams during document processing */
export function publishFieldExtracted(
  organizationId: string,
  data: {
    documentId: string;
    documentName: string;
    projectId?: string;
    fieldKey: string;
    fieldValue: any;
    confidence: number;
    fieldIndex: number;
    totalFields: number;
    documentType: string;
  },
): Promise<void> {
  return publishEvent(
    `org:${organizationId}:uploads`,
    "field_extracted",
    data,
  );
}

/** Extraction started event */
export function publishExtractionStarted(
  organizationId: string,
  data: {
    documentId: string;
    documentName: string;
    documentType: string;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `org:${organizationId}:uploads`,
    "extraction_started",
    data,
  );
}

/** Checklist auto-matched event — pushes to project channel */
export function publishChecklistUpdated(
  projectId: string,
  data: {
    itemId: string;
    itemName: string;
    documentType: string;
    documentId: string;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `project:${projectId}:updates`,
    "checklist_updated",
    data,
  );
}

/** Job progress event */
export function publishJobProgress(
  organizationId: string,
  data: {
    jobId: string;
    jobType: string;
    documentId?: string;
    documentName?: string;
    progress: number; // 0-100
    status: "processing" | "completed" | "failed" | "retrying";
    attempt?: number;
    maxAttempts?: number;
    message: string;
    trustScore?: number;
    warnings?: string[];
  },
): Promise<void> {
  return publishEvent(
    `org:${organizationId}:jobs`,
    "job_progress",
    data,
  );
}

/** Folder structure lock/unlock event (org-scoped) */
export function publishFolderStructureLock(
  organizationId: string,
  data: {
    locked: boolean;
    lockedBy: string | null;
    lockedByName: string | null;
    message: string;
  },
): Promise<void> {
  return publishEvent(
    `org:${organizationId}:uploads`,
    "folder_structure_lock",
    data,
  );
}

/**
 * Create an SSE ReadableStream that subscribes to Redis pub/sub channels.
 * Used by the /api/events SSE endpoint.
 */
export function createSSEStream(channels: string[]): ReadableStream {
  let subscriber: ReturnType<typeof redis.duplicate> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      if (!isRedisReady()) {
        controller.enqueue(encoder.encode(`: no redis connection\n\n`));
        controller.close();
        return;
      }

      subscriber = redis.duplicate();

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          const parsed = JSON.parse(message);
          const sseData = `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Skip malformed messages
        }
      });

      subscriber.subscribe(...channels).catch(() => {
        controller.enqueue(encoder.encode(`: subscribe failed\n\n`));
      });

      // Keepalive every 30s
      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          if (keepaliveTimer) clearInterval(keepaliveTimer);
        }
      }, 30000);

      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ channels })}\n\n`));
    },
    cancel() {
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      if (subscriber) {
        subscriber.unsubscribe().catch((e: any) => console.warn("[sse] redis unsubscribe:", e.message));
        subscriber.disconnect();
        subscriber = null;
      }
    },
  });
}
