import IORedis from "ioredis";

const MAX_RETRIES = 20;

export const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > MAX_RETRIES) {
      console.error(`Redis: giving up after ${MAX_RETRIES} retries`);
      return null; // stop retrying
    }
    const delay = Math.min(times * 500, 5000);
    console.warn(`Redis reconnecting (attempt ${times}/${MAX_RETRIES}, next in ${delay}ms)`);
    return delay;
  },
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

let redisReady = false;
redis.on("ready", () => { redisReady = true; });
redis.on("close", () => { redisReady = false; });
export function isRedisReady(): boolean { return redisReady; }

// Connect async — don't block startup
redis.connect().catch((err) => {
  console.error("Redis initial connection failed:", err.message);
  console.error("Application will continue but features requiring Redis will be unavailable.");
});
