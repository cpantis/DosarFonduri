import { redis, isRedisReady } from "./redis";

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
