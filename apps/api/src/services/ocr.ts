import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const anthropic = new Anthropic();

function safeTmpPath(prefix: string, ext: string): string {
  const os = require("os");
  const path = require("path");
  return path.join(os.tmpdir(), `${prefix}_${crypto.randomUUID()}.${ext}`);
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("pdf", "pdf");
  fs.writeFileSync(inputPath, buffer);

  const script = `
import fitz, sys, json
doc = fitz.open(sys.argv[1])
pages = []
for page in doc:
    text = page.get_text()
    pages.append({"page": page.number + 1, "text": text, "has_text": len(text.strip()) > 50})
doc.close()
print(json.dumps(pages))
`;
  const scriptPath = safeTmpPath("extract", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const pages: Array<{ page: number; text: string; has_text: boolean }> = JSON.parse(result);

    const scannedPages = pages.filter(p => !p.has_text);
    if (scannedPages.length > 0) {
      console.warn(`${scannedPages.length} scanned pages detected - Vision OCR needed`);
    }

    return pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
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
