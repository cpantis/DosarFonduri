import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Don't throw at import time — index.ts has a requiredEnv guard that exits cleanly.
// Throwing here crashes during import resolution, before health checks register.
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set — database operations will fail.");
}

const client = postgres(process.env.DATABASE_URL || "postgres://localhost:5432/dosarfonduri", {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes
});

export const db = drizzle(client, { schema });

// Graceful shutdown
function shutdown() {
  client.end({ timeout: 5 }).catch((e: any) => console.warn("[db] graceful shutdown:", e.message));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
