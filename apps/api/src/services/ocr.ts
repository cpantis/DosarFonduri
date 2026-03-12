import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const anthropic = new Anthropic();

function safeTmpPath(prefix: string, ext: string): string {
  const os = require("os");
  const path = require("path");
  return path.join(os.tmpdir(), `${prefix}_${crypto.randomUUID()}.${ext}`);
}

export interface PageResult {
  page: number;
  text: string;
  is_scanned: boolean;
  confidence: number;
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pages = await extractPDFPages(buffer);
  return pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
}

/** Extract pages with hybrid OCR: PyMuPDF native + Claude Vision for scanned pages */
export async function extractPDFPages(buffer: Buffer): Promise<PageResult[]> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("pdf", "pdf");
  fs.writeFileSync(inputPath, buffer);

  // Script extracts text AND renders scanned pages as base64 PNG
  const script = `
import fitz, sys, json, base64
doc = fitz.open(sys.argv[1])
pages = []
for page in doc:
    text = page.get_text()
    has_text = len(text.strip()) > 50
    page_data = {"page": page.number + 1, "text": text, "has_text": has_text, "image": None}
    if not has_text:
        pix = page.get_pixmap(dpi=200)
        page_data["image"] = base64.b64encode(pix.tobytes("png")).decode()
    pages.append(page_data)
doc.close()
print(json.dumps(pages))
`;
  const scriptPath = safeTmpPath("extract", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 60000,
      maxBuffer: 100 * 1024 * 1024, // 100MB for base64 images
    });

    const rawPages: Array<{ page: number; text: string; has_text: boolean; image: string | null }> = JSON.parse(result);

    const results: PageResult[] = [];
    for (const p of rawPages) {
      if (p.has_text) {
        results.push({ page: p.page, text: p.text, is_scanned: false, confidence: 1.0 });
      } else if (p.image) {
        // OCR scanned page with Claude Vision
        try {
          const ocrText = await ocrPageWithVision(p.image);
          results.push({ page: p.page, text: ocrText, is_scanned: true, confidence: 0.85 });
        } catch (err) {
          console.error(`Vision OCR failed for page ${p.page}:`, err);
          results.push({ page: p.page, text: p.text || "[Pagina scanata - OCR eșuat]", is_scanned: true, confidence: 0 });
        }
      } else {
        results.push({ page: p.page, text: p.text, is_scanned: false, confidence: 1.0 });
      }
    }

    const scannedCount = results.filter(r => r.is_scanned).length;
    if (scannedCount > 0) {
      console.log(`OCR hibrid: ${rawPages.length} pagini total, ${scannedCount} procesate cu Vision`);
    }

    return results;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

export async function ocrPageWithVision(pageImageBase64: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: pageImageBase64 },
        },
        {
          type: "text",
          text: "Extrage tot textul din această imagine de document. Păstrează structura originală (tabele, coloane, paragrafe). Returnează doar textul, fără explicații.",
        },
      ],
    }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

/** Document type classification using Haiku */
export const DOCUMENT_TYPES = [
  "guide", "guide_annex_table", "guide_annex_form",
  "certificat_constatator", "bilant_anaf", "contract_arenda",
  "oferta_pret", "registru_imobilizari", "declaratie_expert_contabil",
  "document_mediu", "extras_cont", "certificat_fiscal",
  "memoriu_template", "cerere_finantare_template",
  "anexa_b_template", "anexa_c_template",
  "carte_identitate", "diploma_studii", "act_constitutiv",
  "statut", "descriere_proiect", "adeverinta", "foto_echipament",
  "other",
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

export async function classifyDocument(textPreview: string): Promise<{
  documentType: DocumentType;
  confidence: number;
  language: string;
  hasTables: boolean;
  hasForms: boolean;
}> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: `Clasifici documente din dosare de finantare europeana. Analizeaza textul si returneaza DOAR JSON valid.`,
    messages: [{
      role: "user",
      content: `Clasifică acest document pe baza primelor pagini:

${textPreview.slice(0, 3000)}

Returnează un singur obiect JSON:
{
  "document_type": "unul din: ${DOCUMENT_TYPES.join(", ")}",
  "confidence": 0.0-1.0,
  "language": "ro" | "en" | "other",
  "has_tables": true/false,
  "has_forms": true/false
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      documentType: DOCUMENT_TYPES.includes(parsed.document_type) ? parsed.document_type : "other",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      language: parsed.language || "ro",
      hasTables: !!parsed.has_tables,
      hasForms: !!parsed.has_forms,
    };
  } catch {
    return { documentType: "other", confidence: 0, language: "ro", hasTables: false, hasForms: false };
  }
}

export async function extractTextFromDOCX(buffer: Buffer, _fileName: string): Promise<string> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("docx", "docx");
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys
from docx import Document

doc = Document(sys.argv[1])
pages = []
current_page = []
page_num = 1

for para in doc.paragraphs:
    text = para.text
    current_page.append(text)
    for run in para.runs:
        if 'w:br' in run._element.xml and 'type="page"' in run._element.xml:
            pages.append(f"--- Pagina {page_num} ---\\n" + "\\n".join(current_page))
            page_num += 1
            current_page = []

if current_page:
    pages.append(f"--- Pagina {page_num} ---\\n" + "\\n".join(current_page))

for table in doc.tables:
    rows = []
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        rows.append(" | ".join(cells))
    pages.append("\\n[TABEL]\\n" + "\\n".join(rows) + "\\n[/TABEL]")

print("\\n\\n".join(pages))
`;

  const scriptPath = safeTmpPath("extract_docx", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    return execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

export async function extractTextFromXLSX(buffer: Buffer, _fileName: string): Promise<string> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("xlsx", "xlsx");
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys
import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
output = []

for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    output.append(f"--- Sheet: {sheet_name} ---")
    for row in ws.iter_rows(values_only=True):
        cells = [str(c) if c is not None else "" for c in row]
        if any(c.strip() for c in cells):
            output.append(" | ".join(cells))

print("\\n".join(output))
`;

  const scriptPath = safeTmpPath("extract_xlsx", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    return execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}
