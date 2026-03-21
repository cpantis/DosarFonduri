import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import crypto from "crypto";

const RENDER_SCRIPT = path.join(__dirname, "document_render.py");

export interface FieldRect {
  x: number;    // percentage of page width
  y: number;    // percentage of page height
  width: number;
  height: number;
}

export interface RenderedField {
  fieldName: string;        // reconciled key (from template_elements if matched)
  fieldType: string;
  currentValue: string;
  rect: FieldRect;
  fontSize?: number;
  cellRef?: string;
  sheetName?: string;
  positionSource?: string;  // "text_search" | "widget" | "text_extraction" | "cell_extraction"
  // Reconciliation metadata
  detectedKey?: string;     // original key from render (before reconciliation)
  knownKey?: string;        // matched template_elements key
  knownLabel?: string;
  knownFieldType?: string;
  knownPageNum?: number;
  matchQuality?: string;    // "exact" | "normalized" | "fuzzy" | "unmatched" | "db_only"
  matchConfidence?: number; // 0.0-1.0
}

export interface UnmatchedKnownKey {
  key: string;
  label: string;
  fieldType: string;
  pageNum: number | null;
  matchQuality: "db_only";
  matchConfidence: 0;
}

export interface RenderedPage {
  pageNum: number;
  imageName: string;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  scale: number;
  fields: RenderedField[];
  sheetName?: string;
  isFallbackRender?: boolean;
}

export interface DocumentRenderResult {
  format: string;
  totalPages: number;
  pages: RenderedPage[];
  unmatchedKnownKeys: UnmatchedKnownKey[];
}

export interface KnownKey {
  key: string;
  label: string;
  fieldType: string;
  pageNum: number | null;
}

/**
 * Render a document (PDF/DOCX/XLSX) as page images with field position metadata.
 *
 * @param buffer - The document file buffer
 * @param fileType - Document type (pdf, docx, xlsx)
 * @param knownKeys - Optional array of template_elements keys for reconciliation.
 *   When provided, the renderer matches detected positions to these known keys
 *   using fuzzy matching, ensuring output uses the same keys as the DB.
 *
 * @returns Render result with pages, fields, and reconciliation metadata
 */
export async function renderDocument(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "xlsx",
  knownKeys?: KnownKey[],
): Promise<{ result: DocumentRenderResult; outputDir: string }> {
  const tmpDir = os.tmpdir();
  const id = crypto.randomUUID();
  const ext = fileType === "pdf" ? "pdf" : fileType === "docx" ? "docx" : "xlsx";
  const inputPath = path.join(tmpDir, `render_${id}.${ext}`);
  const outputDir = path.join(tmpDir, `render_out_${id}`);

  fs.writeFileSync(inputPath, buffer);
  fs.mkdirSync(outputDir, { recursive: true });

  // Write known keys for reconciliation (if provided)
  let knownKeysPath: string | undefined;
  if (knownKeys && knownKeys.length > 0) {
    knownKeysPath = path.join(tmpDir, `render_keys_${id}.json`);
    fs.writeFileSync(knownKeysPath, JSON.stringify(knownKeys));
  }

  try {
    const args = ["render", inputPath, outputDir];
    if (knownKeysPath) {
      args.push(knownKeysPath);
    }

    const result = execFileSync("python3", [RENDER_SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const parsed: DocumentRenderResult = JSON.parse(result.trim());
    return { result: parsed, outputDir };
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    if (knownKeysPath) {
      try { fs.unlinkSync(knownKeysPath); } catch {}
    }
  }
}

/**
 * Read a rendered page image as a Buffer.
 */
export function getPageImage(outputDir: string, imageName: string): Buffer {
  const imgPath = path.join(outputDir, imageName);
  return fs.readFileSync(imgPath);
}

/**
 * Cleanup rendered output directory.
 */
export function cleanupRenderOutput(outputDir: string): void {
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch {}
}
