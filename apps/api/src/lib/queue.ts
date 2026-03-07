import { Queue } from "bullmq";
import { redis } from "./redis";

export const guideQueue = new Queue("guide-processing", { connection: redis });
export const templateQueue = new Queue("template-processing", { connection: redis });
export const onrcQueue = new Queue("onrc-sync", { connection: redis });
