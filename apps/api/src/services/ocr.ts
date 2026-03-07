import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `pdf_${Date.now()}.pdf`);
  fs.writeFileSync(inputPath, buffer);

  try {
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
    const scriptPath = path.join(tmpDir, `extract_${Date.now()}.py`);
    fs.writeFileSync(scriptPath, script);

    const result = execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    const pages: Array<{ page: number; text: string; has_text: boolean }> = JSON.parse(result);

    const scannedPages = pages.filter(p => !p.has_text);
    if (scannedPages.length > 0) {
      console.warn(`${scannedPages.length} scanned pages detected - Vision OCR needed`);
    }

    fs.unlinkSync(scriptPath);
    return pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
  } finally {
    fs.unlinkSync(inputPath);
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

export async function extractTextFromDOCX(buffer: Buffer, fileName: string): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `docx_${Date.now()}_${fileName}`);
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

  const scriptPath = path.join(tmpDir, `extract_docx_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    return execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
  } finally {
    fs.unlinkSync(inputPath);
    fs.unlinkSync(scriptPath);
  }
}

export async function extractTextFromXLSX(buffer: Buffer, fileName: string): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xlsx_${Date.now()}_${fileName}`);
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

  const scriptPath = path.join(tmpDir, `extract_xlsx_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    return execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
  } finally {
    fs.unlinkSync(inputPath);
    fs.unlinkSync(scriptPath);
  }
}
