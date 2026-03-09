import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import path from "path";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set, skipping migrations");
  process.exit(1);
}

const migrationClient = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(migrationClient, { schema });

async function runMigrations() {
  console.log("Running database migrations...");
  try {
    // In production: dist/db/migrate.js → ../../src/db/migrations
    // In dev: src/db/migrate.ts → ./migrations
    const migrationsPath = __dirname.includes("dist")
      ? path.join(__dirname, "../../src/db/migrations")
      : path.join(__dirname, "migrations");
    await migrate(db, { migrationsFolder: migrationsPath });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  // Seed: create initial provider user if none exists
  try {
    const existing = await db.query.providerUsers.findFirst();
    if (!existing) {
      const email = process.env.SEED_PROVIDER_EMAIL || "admin@dosarfonduri.ro";
      const password = process.env.SEED_PROVIDER_PASSWORD || "ChangeMeNow!2026";
      const name = process.env.SEED_PROVIDER_NAME || "DosarFonduri Admin";
      const passwordHash = await hash(password, 12);

      await db.insert(schema.providerUsers).values({ email, passwordHash, name });
      console.log(`Seed: provider user created (${email})`);
    } else {
      console.log("Seed: provider user already exists, skipping");
    }
  } catch (error) {
    console.error("Seed warning:", error);
    // Don't exit — seed failure is not fatal
  }

  await migrationClient.end();
}

runMigrations();
