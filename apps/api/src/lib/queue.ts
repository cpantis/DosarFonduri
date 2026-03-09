import { Queue } from "bullmq";
import { redis } from "./redis";

// Cast needed: ioredis version bundled by bullmq differs from standalone ioredis
const conn = redis as any;

export const processGuideQueue = new Queue("process-guide", { connection: conn });
export const processTemplateQueue = new Queue("process-template", { connection: conn });
export const syncOnrcQueue = new Queue("sync-onrc", { connection: conn });
