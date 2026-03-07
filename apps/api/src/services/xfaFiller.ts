import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const XFA_SCRIPT = path.join(__dirname, "xfa_extract.py");

export interface XFAField {
  key: string;
  label: string;
  currentValue?: string;
  fieldType: "text" | "number" | "textarea" | "date" | "select" | "checkbox" | "signature";
  group: string;
  isRepeating: boolean;
  rowIndex: number | null;
}

/**
 * Extract XFA form fields from a PDF using PyMuPDF XML parsing.
 * Uses XML ElementTree with indexed paths for repeating fields.
 */
export async function extractXFAFields(buffer: Buffer): Promise<XFAField[]> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xfa_${Date.now()}.pdf`);
  fs.writeFileSync(inputPath, buffer);

  try {
    const result = execSync(`python3 ${XFA_SCRIPT} extract ${inputPath}`, {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(result);
  } catch (error) {
    console.error("XFA extraction failed:", error);
    return [];
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
  }
}

/**
 * Fill XFA fields in a PDF with provided values using indexed path navigation.
 * Returns the filled PDF buffer.
 */
export async function fillXFAFields(
  buffer: Buffer,
  values: Record<string, string>,
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xfa_fill_${Date.now()}.pdf`);
  const outputPath = path.join(tmpDir, `xfa_filled_${Date.now()}.pdf`);
  const valuesPath = path.join(tmpDir, `xfa_vals_${Date.now()}.json`);

  fs.writeFileSync(inputPath, buffer);
  fs.writeFileSync(valuesPath, JSON.stringify(values));

  try {
    const result = execSync(
      `python3 ${XFA_SCRIPT} fill ${inputPath} ${outputPath} ${valuesPath}`,
      { encoding: "utf-8", timeout: 60000 }
    );
    const report = JSON.parse(result.trim());
    console.log(`XFA fill: ${report.filled_count} fields filled`);
    return fs.readFileSync(outputPath);
  } finally {
    [inputPath, outputPath, valuesPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });
  }
}
