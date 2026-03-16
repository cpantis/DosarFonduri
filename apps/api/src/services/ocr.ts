import { anthropic, withAILimit } from "../lib/anthropic";
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

export interface PDFExtractionResult {
  text: string;
  hasScannedPages: boolean;
  totalPages: number;
  scannedPageCount: number;
  nativePageCount: number;
  totalChars: number;
  pages: PageResult[];
}

export async function extractTextFromPDF(buffer: Buffer): Promise<PDFExtractionResult> {
  // Try XFA extraction first — XFA PDFs contain form data in XML, not in page text
  const xfaText = await tryExtractXFA(buffer);
  if (xfaText) {
    const xfaPage: PageResult = { page: 1, text: xfaText, is_scanned: false, confidence: 1.0 };
    return {
      text: `--- Pagina 1 (XFA) ---\n${xfaText}`,
      hasScannedPages: false,
      totalPages: 1,
      scannedPageCount: 0,
      nativePageCount: 1,
      totalChars: xfaText.length,
      pages: [xfaPage],
    };
  }

  const pages = await extractPDFPages(buffer);
  const scannedCount = pages.filter(p => p.is_scanned).length;
  const nativeCount = pages.length - scannedCount;
  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
  const text = pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");

  console.log(`[extractTextFromPDF] ${nativeCount} pagini text nativ, ${scannedCount} pagini OCR, ${totalChars} chars total`);

  return {
    text,
    hasScannedPages: scannedCount > 0,
    totalPages: pages.length,
    scannedPageCount: scannedCount,
    nativePageCount: nativeCount,
    totalChars,
    pages,
  };
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
  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: pageImageBase64 },
        },
        {
          type: "text",
          text: "Extrage tot textul din această imagine de document. Păstrează structura originală (tabele, coloane, paragrafe). Returnează doar textul, fără explicații.",
        },
      ],
    }],
  }));

  const textBlock = response.content.find((b: any) => b.type === "text");
  return textBlock ? (textBlock as any).text : "";
}

// ─── GPT-4o PRE-STRUCTURING PER PAGE ───

export interface PreStructuredPage {
  page: number;
  sectionType: "eligibilitate" | "intensitate" | "selectie" | "cheltuieli" | "documente" | "achizitii" | "general" | "cuprins" | "definitii";
  cleanedText: string;
  tables: Array<{ title: string; markdownTable: string }>;
  keyTerms: string[];
}

export interface PreStructuredGuide {
  pages: PreStructuredPage[];
  structuredText: string;
  pageCount: number;
  tableCount: number;
}

/** Max pages per GPT-4o batch to balance cost vs context */
const PRE_STRUCTURE_BATCH_SIZE = 5;

/** Max parallel GPT-4o calls for pre-structuring */
const PRE_STRUCTURE_CONCURRENCY = 3;

/**
 * Pre-structure guide text per page using GPT-4o.
 * Sends batches of pages for: cleaned text, table detection, section classification.
 * Cost: ~$0.15 per guide, ~15s.
 */
export async function preStructurePages(rawText: string): Promise<PreStructuredGuide> {
  const pageDelimiter = /--- Pagina (\d+)(?: \([^)]+\))? ---/g;
  const pageBreaks: Array<{ page: number; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(rawText)) !== null) {
    pageBreaks.push({ page: parseInt(match[1]), index: match.index });
  }

  if (pageBreaks.length === 0) {
    // No page delimiters — treat as single page
    return {
      pages: [{ page: 1, sectionType: "general", cleanedText: rawText, tables: [], keyTerms: [] }],
      structuredText: rawText,
      pageCount: 1,
      tableCount: 0,
    };
  }

  // Split into individual pages
  const rawPages: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < pageBreaks.length; i++) {
    const startIdx = pageBreaks[i].index;
    const endIdx = i + 1 < pageBreaks.length ? pageBreaks[i + 1].index : rawText.length;
    rawPages.push({ page: pageBreaks[i].page, text: rawText.slice(startIdx, endIdx) });
  }

  // Batch pages for GPT-4o processing (max 5 pages OR 30k chars per batch)
  const MAX_BATCH_CHARS = 30_000;
  const batches: Array<Array<{ page: number; text: string }>> = [];
  let currentBatch: Array<{ page: number; text: string }> = [];
  let currentChars = 0;
  for (const page of rawPages) {
    if (currentBatch.length >= PRE_STRUCTURE_BATCH_SIZE || (currentChars + page.text.length > MAX_BATCH_CHARS && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }
    currentBatch.push(page);
    currentChars += page.text.length;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  // Process batches with concurrency limit
  const allPages: PreStructuredPage[] = [];
  let totalTables = 0;

  const processBatch = async (batch: Array<{ page: number; text: string }>): Promise<PreStructuredPage[]> => {
    const pagesText = batch
      .map(p => `=== PAGINA ${p.page} ===\n${p.text}`)
      .join("\n\n");

    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `Ești un pre-procesor de documente de finanțare europeană. Primești pagini brute dintr-un ghid de finanțare și returnezi o versiune structurată.

Pentru FIECARE pagină din input returnează un obiect JSON cu:
- "page": numărul paginii
- "section_type": tipul secțiunii predominante ("eligibilitate", "intensitate", "selectie", "cheltuieli", "documente", "achizitii", "general", "cuprins", "definitii")
- "cleaned_text": textul curățat — fără headere/footere repetitive, fără numere de pagină, cu paragrafe corecte
- "tables": array de obiecte {title, markdown_table} pentru fiecare tabel detectat (formatat ca markdown table)
- "key_terms": array de maxim 10 termeni tehnici cheie din pagină

IMPORTANT:
- Păstrează EXACT conținutul original — nu inventa, nu rezuma
- Tabelele se formatează ca markdown (| col1 | col2 |)
- Identifică secțiunea pe baza titlurilor de capitol și conținutului
- Returnează DOAR un JSON array valid. Fără backticks, fără explicații.`,
      messages: [{
        role: "user",
        content: pagesText,
      }],
    }));

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return batch.map(p => ({
        page: p.page, sectionType: "general" as const, cleanedText: p.text, tables: [], keyTerms: [],
      }));

      const VALID_SECTION_TYPES = new Set(["eligibilitate", "intensitate", "selectie", "cheltuieli", "documente", "achizitii", "general", "cuprins", "definitii"]);
      return parsed.map((item: any, idx: number) => ({
        page: item.page || batch[idx]?.page || idx + 1,
        sectionType: (VALID_SECTION_TYPES.has(item.section_type) ? item.section_type : "general") as PreStructuredPage["sectionType"],
        cleanedText: item.cleaned_text || batch[idx]?.text || "",
        tables: (item.tables || []).map((t: any) => ({
          title: t.title || "Tabel",
          markdownTable: t.markdown_table || "",
        })),
        keyTerms: Array.isArray(item.key_terms) ? item.key_terms : [],
      }));
    } catch {
      console.warn("[preStructurePages] Failed to parse Sonnet batch response, using raw text");
      return batch.map(p => ({
        page: p.page, sectionType: "general" as const, cleanedText: p.text, tables: [], keyTerms: [],
      }));
    }
  };

  // Run batches with concurrency limit
  let nextBatch = 0;
  async function worker() {
    while (nextBatch < batches.length) {
      const idx = nextBatch++;
      const result = await processBatch(batches[idx]);
      for (const page of result) {
        allPages.push(page);
        totalTables += page.tables.length;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(PRE_STRUCTURE_CONCURRENCY, batches.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Sort by page number
  allPages.sort((a, b) => a.page - b.page);

  // Build structured text for downstream Opus consumption
  const structuredText = allPages.map(p => {
    let pageText = `--- Pagina ${p.page} [${p.sectionType}] ---\n${p.cleanedText}`;
    if (p.tables.length > 0) {
      pageText += "\n\n" + p.tables.map(t =>
        `[TABEL: ${t.title}]\n${t.markdownTable}\n[/TABEL]`
      ).join("\n\n");
    }
    return pageText;
  }).join("\n\n");

  console.log(`[preStructurePages] Pre-structured ${allPages.length} pages (${totalTables} tables detected) via Claude Sonnet`);

  return {
    pages: allPages,
    structuredText,
    pageCount: allPages.length,
    tableCount: totalTables,
  };
}

// ─── SONNET PRE-STRUCTURING FOR CLIENT DOCUMENTS ───

/**
 * Pre-structure client document text using Sonnet.
 * Lighter than preStructurePages (guide-oriented) — focuses on:
 * - Cleaning OCR artifacts, headers/footers, page numbers
 * - Formatting messy tables as markdown
 * - Normalizing whitespace and paragraph breaks
 * - Preserving all original content (no summarization)
 *
 * Use for client docs >10 pages or >20K chars where raw PyMuPDF
 * text has quality issues (scanned, multi-column, broken tables).
 *
 * Cost: ~$0.03-0.08 per document (much cheaper than guide pre-structuring).
 */

export interface PreStructuredClientDoc {
  cleanedText: string;
  tableCount: number;
  pageCount: number;
  qualityScore: number; // 0-1, how much the text improved
}

/** Max pages per Sonnet batch for client doc pre-structuring */
const CLIENT_PRE_STRUCTURE_BATCH_SIZE = 8;

/** Max parallel Sonnet calls for client doc pre-structuring */
const CLIENT_PRE_STRUCTURE_CONCURRENCY = 3;

/** Thresholds for triggering pre-structuring */
export const PRE_STRUCTURE_THRESHOLDS = {
  minPages: 10,
  minChars: 20000,
} as const;

/**
 * Document types that should SKIP pre-structuring (already well-structured
 * or too short to benefit, or have dedicated extractors that handle raw text fine).
 */
export const SKIP_PRE_STRUCTURE_TYPES = new Set([
  "bilant_anaf",           // XFA/formular fix, structured
  "certificat_constatator", // ONRC, regex+AI extractor handles it
  "carte_identitate",      // 1-2 pages, Vision OCR already clean
  "certificat_fiscal",     // Short, structured
  "factura",               // Short, dedicated extractor
  "diploma_studii",        // 1 page
  "extras_cont",           // Tabular, dedicated extractor
  "declaratie_expert_contabil", // Short, structured
  "guide",                 // Has its own preStructurePages pipeline
  "guide_annex_table",
  "guide_annex_form",
]);

/**
 * Check whether a document qualifies for Sonnet pre-structuring.
 */
export function shouldPreStructure(
  documentType: string,
  pageCount: number,
  charCount: number,
): boolean {
  if (SKIP_PRE_STRUCTURE_TYPES.has(documentType)) return false;
  return pageCount >= PRE_STRUCTURE_THRESHOLDS.minPages
    || charCount >= PRE_STRUCTURE_THRESHOLDS.minChars;
}

/**
 * Pre-structure client document text using Claude Sonnet.
 * Cleans text, formats tables, removes noise — without changing content.
 */
export async function preStructureClientText(rawText: string): Promise<PreStructuredClientDoc> {
  // Split by page delimiters
  const pageDelimiter = /--- Pagina (\d+)(?: \([^)]+\))? ---/g;
  const pageBreaks: Array<{ page: number; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(rawText)) !== null) {
    pageBreaks.push({ page: parseInt(match[1]), index: match.index });
  }

  if (pageBreaks.length === 0) {
    return { cleanedText: rawText, tableCount: 0, pageCount: 1, qualityScore: 0 };
  }

  // Split into individual pages
  const rawPages: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < pageBreaks.length; i++) {
    const startIdx = pageBreaks[i].index;
    const endIdx = i + 1 < pageBreaks.length ? pageBreaks[i + 1].index : rawText.length;
    rawPages.push({ page: pageBreaks[i].page, text: rawText.slice(startIdx, endIdx) });
  }

  // Batch pages
  const batches: Array<Array<{ page: number; text: string }>> = [];
  for (let i = 0; i < rawPages.length; i += CLIENT_PRE_STRUCTURE_BATCH_SIZE) {
    batches.push(rawPages.slice(i, i + CLIENT_PRE_STRUCTURE_BATCH_SIZE));
  }

  const cleanedPages: Array<{ page: number; cleanedText: string; tableCount: number }> = [];

  const processBatch = async (batch: Array<{ page: number; text: string }>) => {
    const pagesText = batch
      .map(p => `=== PAGINA ${p.page} ===\n${p.text}`)
      .join("\n\n");

    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      system: `Ești un pre-procesor de text pentru documente client din dosare de finanțare europeană.

Primești pagini brute extrase cu PyMuPDF (pot avea artefacte OCR, tabele stricate, coloane amestecate).

Pentru FIECARE pagină returnezi un JSON cu:
- "page": numărul paginii
- "cleaned_text": textul curățat — fără headere/footere repetitive, fără numere de pagină izolate, cu paragrafe corecte, coloane re-aliniate
- "tables": număr de tabele detectate și formatate ca markdown în cleaned_text

REGULI STRICTE:
- Păstrează EXACT conținutul original — NU inventa, NU rezuma, NU traduce
- Corectează doar: spații duble, linii goale excesive, coloane amestecate, tabele stricate
- Tabelele detectate se formatează ca markdown (| col1 | col2 |) direct în cleaned_text
- NU adăuga metadate, clasificări sau comentarii
- Returnează DOAR un JSON array valid. Fără backticks, fără explicații.`,
      messages: [{
        role: "user",
        content: pagesText,
      }],
    }));

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        return batch.map(p => ({ page: p.page, cleanedText: p.text, tableCount: 0 }));
      }
      return parsed.map((item: any, idx: number) => ({
        page: item.page || batch[idx]?.page || idx + 1,
        cleanedText: item.cleaned_text || batch[idx]?.text || "",
        tableCount: typeof item.tables === "number" ? item.tables : 0,
      }));
    } catch {
      console.warn("[preStructureClientText] Failed to parse Sonnet batch response, using raw text");
      return batch.map(p => ({ page: p.page, cleanedText: p.text, tableCount: 0 }));
    }
  };

  // Run batches with concurrency limit
  let nextBatch = 0;
  async function worker() {
    while (nextBatch < batches.length) {
      const idx = nextBatch++;
      const result = await processBatch(batches[idx]);
      cleanedPages.push(...result);
    }
  }

  const workers = Array.from(
    { length: Math.min(CLIENT_PRE_STRUCTURE_CONCURRENCY, batches.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Sort by page number
  cleanedPages.sort((a, b) => a.page - b.page);

  // Build cleaned text
  const cleanedText = cleanedPages
    .map(p => `--- Pagina ${p.page} ---\n${p.cleanedText}`)
    .join("\n\n");

  const totalTables = cleanedPages.reduce((sum, p) => sum + p.tableCount, 0);

  // Quality score: how different is cleaned vs raw (normalized edit distance approximation)
  const rawLen = rawText.length;
  const cleanLen = cleanedText.length;
  const lenDiff = Math.abs(rawLen - cleanLen) / Math.max(rawLen, 1);
  const qualityScore = Math.min(1, lenDiff * 5); // 20%+ length change = 1.0 quality improvement

  console.log(
    `[preStructureClientText] Pre-structured ${cleanedPages.length} pages ` +
    `(${totalTables} tables, quality=${qualityScore.toFixed(2)}) via Claude Sonnet`,
  );

  return {
    cleanedText,
    tableCount: totalTables,
    pageCount: cleanedPages.length,
    qualityScore,
  };
}

// ─── GPT-4o VISION TEMPLATE FIELD DETECTION ───

export interface VisualField {
  key: string;
  label: string;
  fieldType: "text" | "number" | "textarea" | "date" | "table" | "signature" | "select" | "checkbox";
  page: number;
  /** Approximate position for PDF pre-fill */
  position?: { x: number; y: number; width: number; height: number };
  /** Nearby label text detected visually */
  visualLabel: string;
  /** How the field appears: blank line, box, dotted underline, checkbox, etc. */
  appearance: string;
  confidence: number;
}

/** Max parallel GPT-4o Vision calls for field detection */
const VISUAL_FIELD_CONCURRENCY = 3;

/**
 * Render PDF pages as images and detect fillable fields visually using GPT-4o Vision.
 * Detects: blank lines, boxes, checkboxes, dotted underlines, empty table cells, signature areas.
 * Cost: ~$0.02-0.05 per page, ~$0.30-0.75 per template (5-15 pages).
 */
export async function detectFieldsVisually(buffer: Buffer): Promise<VisualField[]> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("tmpl_vis", "pdf");
  fs.writeFileSync(inputPath, buffer);

  // Render each page as base64 PNG at 200 DPI
  const renderScript = `
import fitz, sys, json, base64
doc = fitz.open(sys.argv[1])
pages = []
for page in doc:
    pix = page.get_pixmap(dpi=200)
    img = base64.b64encode(pix.tobytes("png")).decode()
    pages.append({"page": page.number + 1, "image": img, "width": pix.width, "height": pix.height})
doc.close()
print(json.dumps(pages))
`;
  const scriptPath = safeTmpPath("render_tmpl", "py");
  fs.writeFileSync(scriptPath, renderScript);

  let pageImages: Array<{ page: number; image: string; width: number; height: number }>;
  try {
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 60000,
      maxBuffer: 100 * 1024 * 1024,
    });
    pageImages = JSON.parse(result);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }

  if (pageImages.length === 0) return [];

  const allFields: VisualField[] = [];

  const processPage = async (pageData: { page: number; image: string; width: number; height: number }): Promise<VisualField[]> => {
    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `Ești un detector de câmpuri de completat din template-uri de documente de finanțare europeană.

Analizezi VIZUAL o pagină de template și identifici TOATE zonele care trebuie completate:
- Linii goale cu/fără etichetă (ex: "Denumire solicitant: ___________")
- Căsuțe/checkbox-uri goale (□)
- Câmpuri cu chenar/border gol
- Linii punctate sau subliniate unde se scrie
- Celule goale din tabele destinate completării
- Zone de semnătură (ștampilă, semnătura)
- Dropdown-uri sau câmpuri cu opțiuni

Pentru FIECARE câmp detectat returnează:
{
  "key": "snake_case_key derivat din eticheta detectată",
  "label": "eticheta câmpului așa cum apare vizual",
  "field_type": "text|number|textarea|date|table|signature|select|checkbox",
  "position": {"x": procent_x, "y": procent_y, "width": procent_latime, "height": procent_inaltime},
  "visual_label": "textul care apare lângă câmp",
  "appearance": "blank_line|box|dotted|checkbox|table_cell|signature_area",
  "confidence": 0.0-1.0
}

Coordonatele position sunt în PROCENTE din dimensiunea paginii (0-100).

IMPORTANT:
- NU include câmpuri pre-completate (care au deja text)
- Detectează TOATE câmpurile, inclusiv cele mici sau greu vizibile
- Returnează DOAR un JSON array valid. Fără backticks, fără explicații.`,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: pageData.image },
          },
          {
            type: "text",
            text: `Detectează toate câmpurile de completat din pagina ${pageData.page} a template-ului.`,
          },
        ],
      }],
    }));

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: any) => ({
        key: sanitizeFieldKey(item.key || item.label || "unknown"),
        label: item.label || item.visual_label || "Câmp neidentificat",
        fieldType: item.field_type || "text",
        page: pageData.page,
        position: item.position ? {
          x: item.position.x || 0,
          y: item.position.y || 0,
          width: item.position.width || 10,
          height: item.position.height || 3,
        } : undefined,
        visualLabel: item.visual_label || "",
        appearance: item.appearance || "blank_line",
        confidence: Math.min(1, Math.max(0, item.confidence || 0.7)),
      }));
    } catch {
      console.warn(`[detectFieldsVisually] Failed to parse Claude Vision response for page ${pageData.page}`);
      return [];
    }
  };

  // Process pages with concurrency limit
  let nextPage = 0;
  async function worker() {
    while (nextPage < pageImages.length) {
      const idx = nextPage++;
      const fields = await processPage(pageImages[idx]);
      allFields.push(...fields);
    }
  }

  const workers = Array.from(
    { length: Math.min(VISUAL_FIELD_CONCURRENCY, pageImages.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Sort by page, then by vertical position
  allFields.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return (a.position?.y || 0) - (b.position?.y || 0);
  });

  console.log(`[detectFieldsVisually] Detected ${allFields.length} visual fields across ${pageImages.length} pages via Claude Vision`);
  return allFields;
}

function sanitizeFieldKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 255) || "field";
}

/**
 * Cross-check text-extracted placeholders with visually detected fields.
 * Returns merged list with confidence adjustments.
 */
export function crossCheckFields(
  textFields: Array<{ key: string; label: string; fieldType: string; pageNum: number }>,
  visualFields: VisualField[],
): {
  merged: Array<{
    key: string;
    label: string;
    fieldType: string;
    pageNum: number;
    source: "text" | "visual" | "both";
    confidence: number;
    position?: VisualField["position"];
  }>;
  stats: {
    textOnly: number;
    visualOnly: number;
    both: number;
    total: number;
  };
} {
  const merged: Array<{
    key: string;
    label: string;
    fieldType: string;
    pageNum: number;
    source: "text" | "visual" | "both";
    confidence: number;
    position?: VisualField["position"];
  }> = [];

  const matchedVisualKeys = new Set<string>();

  // For each text field, try to find a matching visual field
  for (const tf of textFields) {
    const normalizedKey = tf.key.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Look for matching visual field on the same page (or nearby pages)
    const matchingVisual = visualFields.find(vf => {
      const vNorm = vf.key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const labelNorm = vf.visualLabel.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Match by key similarity or label containment
      const keyMatch = vNorm === normalizedKey || bigramSimilarity(vNorm, normalizedKey) > 0.6;
      const labelMatch = labelNorm.includes(normalizedKey) || normalizedKey.includes(labelNorm);
      const pageClose = Math.abs(vf.page - tf.pageNum) <= 1;

      return (keyMatch || labelMatch) && pageClose && !matchedVisualKeys.has(vf.key);
    });

    if (matchingVisual) {
      matchedVisualKeys.add(matchingVisual.key);
      merged.push({
        key: tf.key, // keep original text key (has {{placeholder}} naming)
        label: tf.label,
        fieldType: tf.fieldType,
        pageNum: tf.pageNum,
        source: "both",
        confidence: Math.min(1, (matchingVisual.confidence + 1.0) / 2), // boost confidence
        position: matchingVisual.position,
      });
    } else {
      // Text-only field — still valid but lower confidence for review
      merged.push({
        key: tf.key,
        label: tf.label,
        fieldType: tf.fieldType,
        pageNum: tf.pageNum,
        source: "text",
        confidence: 0.85,
      });
    }
  }

  // Add visual-only fields (found visually but not in text)
  for (const vf of visualFields) {
    if (!matchedVisualKeys.has(vf.key)) {
      merged.push({
        key: vf.key,
        label: vf.label || vf.visualLabel,
        fieldType: vf.fieldType,
        pageNum: vf.page,
        source: "visual",
        confidence: vf.confidence * 0.9, // slightly lower since not confirmed by text
        position: vf.position,
      });
    }
  }

  const textOnly = merged.filter(m => m.source === "text").length;
  const visualOnly = merged.filter(m => m.source === "visual").length;
  const both = merged.filter(m => m.source === "both").length;

  return {
    merged,
    stats: { textOnly, visualOnly, both, total: merged.length },
  };
}

/** Simple bigram similarity for field key matching */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
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
