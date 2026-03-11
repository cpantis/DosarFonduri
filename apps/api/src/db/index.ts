import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required. Set it in Railway Variables.");
}

const client = postgres(process.env.DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes
});

export const db = drizzle(client, { schema });

// Graceful shutdown
function shutdown() {
  client.end({ timeout: 5 }).catch(() => {});
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
