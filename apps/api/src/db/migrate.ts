import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set, skipping migrations");
  process.exit(1);
}

const migrationClient = postgres(DATABASE_URL, { max: 1, connect_timeout: 15 });
const db = drizzle(migrationClient, { schema });

async function runMigrations() {
  console.log("Running database migrations...");

  // Determine migrations path
  const migrationsPath = __dirname.includes("dist")
    ? path.join(__dirname, "../../src/db/migrations")
    : path.join(__dirname, "migrations");

  console.log("Migrations path:", migrationsPath);
  console.log("Path exists:", fs.existsSync(migrationsPath));
  if (fs.existsSync(migrationsPath)) {
    console.log("Migration files:", fs.readdirSync(migrationsPath));
  }

  try {
    await migrate(db, { migrationsFolder: migrationsPath });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  // Verify tables actually exist — if not, run SQL directly
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'
      ) as exists
    `);
    const tableExists = result[0]?.exists;
    console.log("Users table exists:", tableExists);

    if (!tableExists) {
      console.log("Tables missing after migrate — running SQL directly...");
      const sqlFile = path.join(migrationsPath, "0000_powerful_dark_beast.sql");
      if (fs.existsSync(sqlFile)) {
        const sqlContent = fs.readFileSync(sqlFile, "utf-8");
        // Split by statement-breakpoint and execute each statement
        const statements = sqlContent.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          try {
            await db.execute(sql.raw(stmt));
          } catch (e: any) {
            // Ignore "already exists" errors
            if (!e.message?.includes("already exists")) {
              console.warn("Statement warning:", e.message?.substring(0, 100));
            }
          }
        }
        console.log("Direct SQL execution completed");
      } else {
        console.error("SQL file not found:", sqlFile);
      }
    }
  } catch (error) {
    console.error("Table verification failed:", error);
  }

  // Run extra SQL migrations not tracked by drizzle journal (0004+)
  try {
    const extraFiles = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith(".sql") && !f.startsWith("0000") && !f.startsWith("0001") && !f.startsWith("0002") && !f.startsWith("0003"))
      .sort();
    for (const file of extraFiles) {
      const sqlContent = fs.readFileSync(path.join(migrationsPath, file), "utf-8");
      const statements = sqlContent.split(/;(?=\s*(?:--|ALTER|CREATE|DO|INSERT|UPDATE|DROP|$))/i)
        .map(s => s.replace(/^[\s]*--[^\n]*\n/gm, "").trim())
        .filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          await db.execute(sql.raw(stmt));
        } catch (e: any) {
          if (!e.message?.includes("already exists") && !e.message?.includes("duplicate")) {
            console.warn(`[${file}] warning:`, e.message?.substring(0, 120));
          }
        }
      }
      console.log(`Extra migration applied: ${file}`);
    }
  } catch (error) {
    console.error("Extra migrations warning:", error);
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
    console.error("Seed provider warning:", error);
  }

  // Seed: create demo organization + user if none exists
  try {
    const existingUser = await db.query.users.findFirst();
    if (!existingUser) {
      // Create demo organization
      const [org] = await db.insert(schema.organizations).values({
        name: "Demo Cabinet",
        code: "DEMO-2026",
        plan: "professional",
        maxUsers: 5,
        status: "active",
      }).returning();

      // Create demo admin user
      const demoEmail = "calin_pantis@yahoo.com";
      const demoPassword = "Demo2026!Selenade";
      const passwordHash = await hash(demoPassword, 12);

      await db.insert(schema.users).values({
        email: demoEmail,
        name: "Calin Pantis",
        passwordHash,
        organizationId: org.id,
        role: "admin",
        status: "active",
      });

      console.log(`Seed: demo user created (${demoEmail}) in org "${org.name}"`);
    } else {
      console.log("Seed: users already exist, skipping demo user");
    }
  } catch (error) {
    console.error("Seed demo warning:", error);
  }

  await migrationClient.end();
}

runMigrations()
  .then(() => {
    console.log("Migration script finished, exiting.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration script failed:", err);
    process.exit(1);
  });
