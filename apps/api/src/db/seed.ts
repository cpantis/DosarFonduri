/**
 * Seed script — creates the initial provider admin user.
 *
 * Usage:
 *   npx tsx src/db/seed.ts
 *
 * Requires DATABASE_URL in .env or environment.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import * as schema from "./schema";

const PROVIDER_EMAIL = process.env.SEED_PROVIDER_EMAIL || "admin@dosarfonduri.ro";
const PROVIDER_PASSWORD = process.env.SEED_PROVIDER_PASSWORD || "ChangeMeNow!2026";
const PROVIDER_NAME = process.env.SEED_PROVIDER_NAME || "DosarFonduri Admin";

async function seed() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding database...");

  // Check if provider already exists
  const existing = await db.query.providerUsers.findFirst({
    where: (pu, { eq }) => eq(pu.email, PROVIDER_EMAIL),
  });

  if (existing) {
    console.log(`⏭  Provider "${PROVIDER_EMAIL}" already exists — skipping.`);
  } else {
    const passwordHash = await hash(PROVIDER_PASSWORD, 12);

    const [provider] = await db.insert(schema.providerUsers).values({
      email: PROVIDER_EMAIL,
      passwordHash,
      name: PROVIDER_NAME,
    }).returning();

    console.log(`✅ Provider created: ${provider.email} (id: ${provider.id})`);
    console.log(`   ⚠  Default password: ${PROVIDER_PASSWORD}`);
    console.log(`   ⚠  Change it immediately after first login!`);
  }

  await client.end();
  console.log("🌱 Seed complete.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
