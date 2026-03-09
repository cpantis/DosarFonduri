import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set, skipping migrations");
  process.exit(1);
}

const migrationClient = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(migrationClient);

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
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
