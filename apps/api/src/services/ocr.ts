import { anthropic, withAILimit } from "../lib/anthropic";
import { openai } from "../lib/openai";
import crypto from "crypto";

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
  // Try XFA extraction first — XFA PDFs contain form data in XML, not in page text
  const xfaText = await tryExtractXFA(buffer);
  if (xfaText) {
    return `--- Pagina 1 (XFA) ---\n${xfaText}`;
  }

  const pages = await extractPDFPages(buffer);
  return pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
}

/**
 * Try to extract XFA form data from a PDF.
 * XFA PDFs (Adobe LiveCycle) store form data in XML streams,
 * not in the visible page text. PyMuPDF can access these via doc.xfa.
 * Returns null if the PDF is not XFA or has no data.
 */
async function tryExtractXFA(buffer: Buffer): Promise<string | null> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("xfa", "pdf");
  fs.writeFileSync(inputPath, buffer);

  // XFA PDFs store form data in compressed XML streams referenced by the AcroForm /XFA array.
  // PyMuPDF's doc.xfa may not work on all versions, so we manually locate and decompress
  // the datasets stream by parsing the AcroForm /XFA reference from the PDF catalog.
  const script = `
import fitz, sys, json, zlib, re
import xml.etree.ElementTree as ET

doc = fitz.open(sys.argv[1])

# Strategy 1: Try doc.xfa (works in newer PyMuPDF)
datasets_xml = None
try:
    if hasattr(doc, 'xfa') and doc.xfa is not None:
        for key in ["datasets", "Datasets"]:
            try:
                datasets_xml = doc.xfa[key]
                if isinstance(datasets_xml, bytes):
                    datasets_xml = datasets_xml.decode('utf-8', errors='replace')
                break
            except (KeyError, TypeError):
                pass
except:
    pass

# Strategy 2: Manually find and decompress XFA streams from AcroForm
if not datasets_xml:
    # Find /XFA array in AcroForm
    datasets_xref = None
    for i in range(doc.xref_length()):
        try:
            obj = doc.xref_object(i)
            if '/XFA' in obj:
                # Parse the XFA array to find datasets xref
                # Format: /XFA [ (xdp:xdp) 73 0 R ... (datasets) 74 0 R ... ]
                xfa_match = re.search(r'\\(datasets\\)\\s+(\\d+)\\s+0\\s+R', obj)
                if xfa_match:
                    datasets_xref = int(xfa_match.group(1))
                    break
        except:
            pass

    if datasets_xref:
        try:
            raw = doc.xref_stream_raw(datasets_xref)
            if raw:
                try:
                    decompressed = zlib.decompress(raw)
                    datasets_xml = decompressed.decode('utf-8', errors='replace')
                except zlib.error:
                    datasets_xml = raw.decode('utf-8', errors='replace')
        except:
            pass

if not datasets_xml:
    print(json.dumps({"is_xfa": False}))
    doc.close()
    sys.exit(0)

# Parse the XFA datasets XML
xml_clean = datasets_xml
for ns_prefix in ['xfa:', 'tpl:', 'ds:']:
    xml_clean = xml_clean.replace(ns_prefix, '')

lines = []
fields = {}

try:
    root = ET.fromstring(xml_clean)

    def extract_fields(elem, path=""):
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        current_path = f"{path}/{tag}" if path else tag

        text = (elem.text or "").strip()
        if text and tag not in ('datasets', 'data', 'template', 'subform'):
            fields[current_path] = text
            lines.append(f"{tag}: {text}")

        for child in elem:
            extract_fields(child, current_path)

    extract_fields(root)
except ET.ParseError:
    # Fallback: regex extraction of text content between XML tags
    text_parts = re.findall(r'>([^<]+)<', datasets_xml)
    for part in text_parts:
        stripped = part.strip()
        if stripped and not stripped.startswith('<?') and len(stripped) < 500:
            lines.append(stripped)

result = {
    "is_xfa": True,
    "text": "\\n".join(lines),
    "fields": fields,
    "field_count": len(fields)
}
print(json.dumps(result, ensure_ascii=False))
doc.close()
`;

  const scriptPath = safeTmpPath("xfa_extract", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const parsed = JSON.parse(result);

    if (!parsed.is_xfa) return null;
    if (parsed.error) {
      console.warn(`[XFA] Extraction error: ${parsed.error}`);
    }

    const text = parsed.text || "";
    if (text.length < 10) return null; // No meaningful data

    console.log(`[XFA] Extracted ${parsed.field_count || 0} fields from XFA PDF`);
    return text;
  } catch {
    return null; // Not XFA or extraction failed — fall through to normal extraction
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
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

export async function ocrPageWithVision(pageImageBase64: string, mediaType: string = "image/png"): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mediaType};base64,${pageImageBase64}`, detail: "high" },
        },
        {
          type: "text",
          text: "Extrage tot textul din această imagine de document. Păstrează structura originală (tabele, coloane, paragrafe). Returnează doar textul, fără explicații.",
        },
      ],
    }],
  });

  return response.choices[0]?.message?.content || "";
}

/** Document type classification using Haiku */
export const DOCUMENT_TYPES = [
  "guide", "guide_annex_table", "guide_annex_form",
  "certificat_constatator", "bilant_anaf", "contract_arenda",
  "oferta_pret", "registru_imobilizari", "declaratie_expert_contabil",
  "document_mediu", "extras_cont", "certificat_fiscal",
  "memoriu_template", "cerere_finantare_template",
  "anexa_b_template", "anexa_c_template",
  "carte_identitate", "diploma_studii", "act_constitutiv", "factura",
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
  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
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
  }));

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

/** Extract text from an image (PNG/JPG) using Claude Vision */
export async function extractTextFromImage(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop() || "png";
  const mediaType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  const base64Data = buffer.toString("base64");

  const ocrText = await ocrPageWithVision(base64Data, mediaType);
  return `--- Pagina 1 (imagine) ---\n${ocrText}`;
}

/** Extract text from a .doc file (legacy Word format) using antiword or LibreOffice */
export async function extractTextFromDOC(buffer: Buffer, _fileName: string): Promise<string> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("doc", "doc");
  fs.writeFileSync(inputPath, buffer);

  try {
    // Try antiword first (lightweight)
    try {
      const text = execFileSync(`antiword "${inputPath}"`, { encoding: "utf-8", timeout: 15000 });
      if (text.trim().length > 50) return text;
    } catch {}

    // Fallback: LibreOffice convert to text
    try {
      const outDir = safeTmpPath("doc_out", "dir");
      const fs2 = await import("fs");
      fs2.mkdirSync(outDir, { recursive: true });
      execFileSync("libreoffice", [
        "--headless", "--convert-to", "txt:Text", "--outdir", outDir, inputPath,
      ], { encoding: "utf-8", timeout: 30000 });

      const txtFiles = fs2.readdirSync(outDir).filter((f: string) => f.endsWith(".txt"));
      if (txtFiles.length > 0) {
        const text = fs2.readFileSync(`${outDir}/${txtFiles[0]}`, "utf-8");
        try { fs2.rmSync(outDir, { recursive: true }); } catch {}
        return text;
      }
      try { fs2.rmSync(outDir, { recursive: true }); } catch {}
    } catch {}

    return "[DOC extraction failed — neither antiword nor LibreOffice available]";
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
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
