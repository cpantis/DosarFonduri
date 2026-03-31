/**
 * FormSpec Extractor Service — TypeScript bridge to Python extractors.
 *
 * Detects format (XFA, AcroForm, DOCX, XLSX) and extracts a universal
 * FormSpec JSON from any form template. Calls formspec_extract.py.
 */
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "../db";
import { formSpecs } from "../db/schema";
import { eq } from "drizzle-orm";

const SCRIPT_PATH = path.join(__dirname, "formspec_extract.py");

// In dist (compiled), the .py file is at ../../src/services/
function getScriptPath(): string {
  if (fs.existsSync(SCRIPT_PATH)) return SCRIPT_PATH;
  const altPath = path.join(__dirname, "../../src/services/formspec_extract.py");
  if (fs.existsSync(altPath)) return altPath;
  throw new Error("formspec_extract.py not found");
}

export interface FormSpecResult {
  name: string;
  version: string;
  programCode: string;
  sourceFormat: string;
  sections: any[];
  referenceData: Record<string, any>;
  formulas: any[];
  declarations: any[];
  extractedFrom: string;
  confidence: number;
  totalFields: number;
}

/**
 * Detect the form format of a file.
 */
export function detectFormFormat(filePath: string): string {
  const scriptPath = getScriptPath();
  const result = execFileSync("python3", [scriptPath, "detect", filePath], {
    encoding: "utf-8",
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024,
  });

  const parsed = JSON.parse(result.trim());
  if (parsed.error) throw new Error(parsed.error);
  return parsed.format;
}

/**
 * Extract FormSpec from a file (auto-detects format).
 */
export function extractFormSpec(filePath: string): FormSpecResult {
  const scriptPath = getScriptPath();
  const result = execFileSync("python3", [scriptPath, "extract", filePath], {
    encoding: "utf-8",
    timeout: 120000, // 2 min for complex XFA PDFs
    maxBuffer: 50 * 1024 * 1024,
  });

  const parsed = JSON.parse(result.trim());
  if (parsed.error) throw new Error(`FormSpec extraction failed: ${parsed.error}`);
  return parsed;
}

/**
 * Extract FormSpec from a buffer (writes to temp file, extracts, cleans up).
 */
export function extractFormSpecFromBuffer(
  buffer: Buffer,
  fileName: string,
): FormSpecResult {
  const ext = path.extname(fileName).toLowerCase() || ".pdf";
  const tmpPath = path.join(
    require("os").tmpdir(),
    `formspec_${crypto.randomUUID()}${ext}`,
  );

  try {
    fs.writeFileSync(tmpPath, buffer);
    return extractFormSpec(tmpPath);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Extract FormSpec and save to database.
 */
export async function extractAndSaveFormSpec(
  buffer: Buffer,
  fileName: string,
  documentId: string,
  organizationId: string,
): Promise<{ formSpecId: string; spec: FormSpecResult }> {
  const spec = extractFormSpecFromBuffer(buffer, fileName);

  // Deactivate any previous FormSpec for this document
  await db
    .update(formSpecs)
    .set({ isActive: false })
    .where(eq(formSpecs.documentId, documentId));

  // Insert new FormSpec
  const [record] = await db
    .insert(formSpecs)
    .values({
      name: spec.name || fileName,
      version: spec.version || "",
      programCode: spec.programCode || null,
      sourceFormat: spec.sourceFormat,
      documentId,
      organizationId,
      spec: spec as any,
      referenceData: spec.referenceData || null,
      totalFields: spec.totalFields || 0,
    })
    .returning();

  return { formSpecId: record.id, spec };
}
