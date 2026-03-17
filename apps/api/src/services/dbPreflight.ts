import { sql } from "drizzle-orm";
import type { db as DbType } from "../db";

export type Operation =
  | "processGuide"
  | "processTemplate"
  | "processCompany"
  | "solomonChat"
  | "neemiaGenerate";

export interface PreflightResult {
  ready: boolean;
  missing: string[];
  message: string;
}

/**
 * Required tables and columns for each AI operation.
 * Format: "table_name" for table existence, "table_name.column_name" for column existence.
 */
const REQUIREMENTS: Record<Operation, string[]> = {
  processGuide: [
    "rules",
    "rules.document_id",
    "rules.organization_id",
    "rules.category",
    "rules.confidence",
    "scoring_criteria",
    "scoring_criteria.max_points",
    "element_definitions",
    "element_definitions.element_key",
    "element_definitions.organization_id",
    "element_rule_links",
    "rule_reference_links",
    "guide_reference_tables",
    "template_placeholder_mapping",
  ],
  processTemplate: [
    "template_elements",
    "template_elements.document_id",
    "template_placeholder_mapping",
    "element_definitions",
  ],
  processCompany: [
    "companies",
    "companies.cui",
    "companies.organization_id",
    "company_associates",
  ],
  solomonChat: [
    "solomon_conversations",
    "solomon_messages",
    "project_elements",
    "project_elements.element_def_id",
    "project_elements.confirmed",
    "element_definitions",
    "rules",
    "guide_reference_tables",
    "solomon_knowledge",
    "project_eligibility",
    "scoring_criteria",
  ],
  neemiaGenerate: [
    "project_documents",
    "project_elements",
    "template_elements",
    "template_placeholder_mapping",
    "element_definitions",
  ],
};

async function checkTableExists(database: typeof DbType, tableName: string): Promise<boolean> {
  const result = await database.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    )
  `);
  return (result as any)[0]?.exists === true || (result as any).rows?.[0]?.exists === true;
}

async function checkColumnExists(database: typeof DbType, tableName: string, columnName: string): Promise<boolean> {
  const result = await database.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${columnName}
    )
  `);
  return (result as any)[0]?.exists === true || (result as any).rows?.[0]?.exists === true;
}

export async function preflight(database: typeof DbType, operation: Operation): Promise<PreflightResult> {
  const requirements = REQUIREMENTS[operation];
  const missing: string[] = [];

  for (const req of requirements) {
    if (req.includes(".")) {
      const [table, column] = req.split(".");
      if (!(await checkColumnExists(database, table, column))) {
        missing.push(req);
      }
    } else {
      if (!(await checkTableExists(database, req))) {
        missing.push(req);
      }
    }
  }

  if (missing.length === 0) {
    return { ready: true, missing: [], message: "OK" };
  }

  return {
    ready: false,
    missing,
    message:
      `Baza de date nu este pregătită pentru ${operation}. ` +
      `Lipsesc: ${missing.join(", ")}. ` +
      `Rulați migrarea: bun run db:push`,
  };
}

// ═══ CACHE (avoid checking on every Solomon message) ═══

const PREFLIGHT_CACHE = new Map<string, { result: PreflightResult; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function preflightCached(database: typeof DbType, operation: Operation): Promise<PreflightResult> {
  const cached = PREFLIGHT_CACHE.get(operation);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }

  const result = await preflight(database, operation);
  PREFLIGHT_CACHE.set(operation, { result, expires: Date.now() + CACHE_TTL });
  return result;
}

/** Invalidate cache (call after running migrations) */
export function invalidatePreflightCache(): void {
  PREFLIGHT_CACHE.clear();
}
