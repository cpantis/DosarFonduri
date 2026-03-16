import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

/**
 * Split SQL content into executable statements, correctly handling:
 * - DO $$ ... END $$; blocks (PL/pgSQL)
 * - Regular semicolon-terminated statements
 * - SQL comments (-- line comments)
 */
function splitSqlStatements(content: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBlock = false;
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip pure comment lines outside of blocks
    if (!inDollarBlock && trimmed.startsWith("--")) {
      continue;
    }

    // Detect DO $$ or BEGIN $$ blocks
    if (!inDollarBlock && /\$\$/.test(trimmed)) {
      inDollarBlock = true;
      current += line + "\n";
      // Check if block also ends on the same line (e.g., DO $$ ... END $$;)
      const matches = trimmed.match(/\$\$/g);
      if (matches && matches.length >= 2) {
        inDollarBlock = false;
        if (trimmed.endsWith(";")) {
          statements.push(current.trim());
          current = "";
        }
      }
      continue;
    }

    if (inDollarBlock) {
      current += line + "\n";
      if (/\$\$\s*;?\s*$/.test(trimmed)) {
        inDollarBlock = false;
        statements.push(current.trim());
        current = "";
      }
      continue;
    }

    // Regular SQL: accumulate until semicolon at end of line
    current += line + "\n";
    if (trimmed.endsWith(";")) {
      const stmt = current.trim();
      // Remove trailing statement-breakpoint comments
      const cleaned = stmt.replace(/-->\s*statement-breakpoint\s*$/, "").trim();
      if (cleaned.length > 0) {
        statements.push(cleaned);
      }
      current = "";
    }
  }

  // Handle any remaining content
  const remaining = current.trim();
  if (remaining.length > 0 && remaining !== ";") {
    statements.push(remaining);
  }

  return statements;
}

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
        const statements = splitSqlStatements(sqlContent);
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
  // Uses a tracking table to avoid re-running migrations on every startup
  try {
    // Ensure tracking table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "_extra_migrations" (
        "filename" varchar(255) PRIMARY KEY,
        "applied_at" timestamp DEFAULT now() NOT NULL
      )
    `);

    // Get already-applied migrations
    const applied = await db.execute(sql`SELECT filename FROM "_extra_migrations"`);
    const appliedSet = new Set((applied as unknown as Array<{ filename: string }>).map(r => r.filename));

    const extraFiles = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith(".sql") && !f.startsWith("0000") && !f.startsWith("0001") && !f.startsWith("0002") && !f.startsWith("0003"))
      .sort();

    for (const file of extraFiles) {
      if (appliedSet.has(file)) {
        continue; // Already applied
      }

      const sqlContent = fs.readFileSync(path.join(migrationsPath, file), "utf-8");
      // Split SQL into executable statements, handling DO $$ blocks and semicolons
      const statements = splitSqlStatements(sqlContent);
      let hasError = false;

      for (const stmt of statements) {
        try {
          await db.execute(sql.raw(stmt));
        } catch (e: any) {
          const msg = e.message || "";
          // Benign errors that indicate the change already exists
          if (msg.includes("already exists") || msg.includes("duplicate")) {
            continue;
          }
          // Log non-benign errors but continue (idempotent migrations)
          console.warn(`[${file}] warning:`, msg.substring(0, 150));
          hasError = true;
        }
      }

      // Track as applied even if some statements had warnings (they're idempotent)
      try {
        await db.execute(sql`INSERT INTO "_extra_migrations" (filename) VALUES (${file}) ON CONFLICT DO NOTHING`);
      } catch {
        // Tracking insert failed — not critical
      }
      console.log(`Extra migration applied: ${file}${hasError ? " (with warnings)" : ""}`);
    }
  } catch (error) {
    console.error("Extra migrations warning:", error);
  }

  // Seed: create initial provider user if none exists
  try {
    const existing = await db.query.providerUsers.findFirst();
    if (!existing) {
      const email = process.env.SEED_PROVIDER_EMAIL;
      const password = process.env.SEED_PROVIDER_PASSWORD;
      const name = process.env.SEED_PROVIDER_NAME || "DosarFonduri Admin";

      if (!email || !password) {
        console.log("Seed: SEED_PROVIDER_EMAIL and SEED_PROVIDER_PASSWORD must be set to create initial provider user. Skipping.");
      } else {
        const passwordHash = await hash(password, 12);
        await db.insert(schema.providerUsers).values({ email, passwordHash, name });
        console.log(`Seed: provider user created (${email})`);
      }
    } else {
      console.log("Seed: provider user already exists, skipping");
    }
  } catch (error) {
    console.error("Seed provider warning:", error);
  }

  // Seed: create demo organization + user if none exists (only when SEED_DEMO_EMAIL is set)
  try {
    const existingUser = await db.query.users.findFirst();
    if (!existingUser) {
      const demoEmail = process.env.SEED_DEMO_EMAIL;
      const demoPassword = process.env.SEED_DEMO_PASSWORD;

      if (!demoEmail || !demoPassword) {
        console.log("Seed: SEED_DEMO_EMAIL and SEED_DEMO_PASSWORD must be set to create demo user. Skipping.");
      } else {
        // Create demo organization
        const [org] = await db.insert(schema.organizations).values({
          name: process.env.SEED_DEMO_ORG_NAME || "Demo Cabinet",
          code: "DEMO-2026",
          plan: "professional",
          maxUsers: 5,
          status: "active",
        }).returning();

        const passwordHash = await hash(demoPassword, 12);
        await db.insert(schema.users).values({
          email: demoEmail,
          name: process.env.SEED_DEMO_USER_NAME || "Demo Admin",
          passwordHash,
          organizationId: org.id,
          role: "admin",
          status: "active",
        });

        console.log(`Seed: demo user created (${demoEmail}) in org "${org.name}"`);
      }
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
