import { Queue } from "bullmq";
import { redis } from "./redis";

export const processGuideQueue = new Queue("process-guide", { connection: redis });
export const processTemplateQueue = new Queue("process-template", { connection: redis });
export const syncOnrcQueue = new Queue("sync-onrc", { connection: redis });
