import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 5000);
    console.warn(`Redis reconnecting (attempt ${times}, next in ${delay}ms)`);
    return delay;
  },
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

// Connect async — don't block startup
redis.connect().catch((err) => {
  console.error("Redis initial connection failed:", err.message);
});
