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
  fieldName: string;
  fieldType: string;
  currentValue: string;
  rect: FieldRect;
  rectPt: { x0: number; y0: number; x1: number; y1: number };
  fontSize?: number;
  cellRef?: string;
  sheetName?: string;
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
  xfaFields?: any[];
}

export interface DocumentRenderResult {
  format: string;
  totalPages: number;
  pages: RenderedPage[];
}

/**
 * Render a document (PDF/DOCX/XLSX) as page images with field position metadata.
 * Returns the render result and the output directory containing page images.
 */
export async function renderDocument(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "xlsx",
): Promise<{ result: DocumentRenderResult; outputDir: string }> {
  const tmpDir = os.tmpdir();
  const id = crypto.randomUUID();
  const ext = fileType === "pdf" ? "pdf" : fileType === "docx" ? "docx" : "xlsx";
  const inputPath = path.join(tmpDir, `render_${id}.${ext}`);
  const outputDir = path.join(tmpDir, `render_out_${id}`);

  fs.writeFileSync(inputPath, buffer);
  fs.mkdirSync(outputDir, { recursive: true });

  const action = `render_${fileType}`;

  try {
    const result = execFileSync("python3", [RENDER_SCRIPT, action, inputPath, outputDir], {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const parsed: DocumentRenderResult = JSON.parse(result.trim());
    return { result: parsed, outputDir };
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
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
