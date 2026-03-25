import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents, templateElements } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishJobProgress } from "../lib/sse";
import { redis } from "../lib/redis";
import { autoMapTemplatePlaceholders } from "../services/elementDefinitionService";
import { anthropic, withAILimit } from "../lib/anthropic";
import { detectFieldsVisually, crossCheckFields } from "../services/ocr";
import { preflightCached } from "../services/dbPreflight";

interface ProcessTemplatePayload {
  documentId: string;
  organizationId: string;
}

/**
 * Re-classify template documentTypeClass based on extracted field keys.
 * Confirms or corrects the filename-based heuristic from upload.
 */
function classifyTemplateFromContent(
  fieldKeys: string[],
  fileName: string,
  fileType: string,
): string | null {
  const allKeys = fieldKeys.map(k => k.toLowerCase()).join(" ");
  const name = fileName.toLowerCase();

  // Cerere Finanțare signals: CUI, IBAN, plan financiar, buget, valoare proiect
  const cerereSignals = ["cui", "iban", "plan_financiar", "valoare_proiect", "buget_total", "solicitant", "cod_caen"];
  const cerereHits = cerereSignals.filter(s => allKeys.includes(s)).length;

  // Anexa B signals: financial viability, RAFN, VAN, rata indatorarii, cash flow
  const anexaBSignals = ["rafn", "van", "rata_indatorarii", "cash_flow", "venituri", "cheltuieli", "amortizare", "previzion"];
  const anexaBHits = anexaBSignals.filter(s => allKeys.includes(s)).length;

  // Anexa C signals: plan afaceri, piata, concurenta, marketing, strategie
  const anexaCSignals = ["plan_afaceri", "piata", "concurenta", "marketing", "strategie", "swot"];
  const anexaCHits = anexaCSignals.filter(s => allKeys.includes(s)).length;

  // Memoriu signals: descriere, obiective, activitati, rezultate, durabilitate
  const memoriuSignals = ["descriere", "obiective", "activitat", "rezultat", "durabilitat", "context", "justificar"];
  const memoriuHits = memoriuSignals.filter(s => allKeys.includes(s)).length;

  // Pick highest signal count (min 2 hits to override)
  const scores = [
    { type: "cerere_finantare_template", hits: cerereHits },
    { type: "anexa_b_template", hits: anexaBHits },
    { type: "anexa_c_template", hits: anexaCHits },
    { type: "memoriu_template", hits: memoriuHits },
  ];
  const best = scores.reduce((a, b) => b.hits > a.hits ? b : a);

  if (best.hits >= 2) return best.type;

  // Fallback: filename heuristic (same logic as upload)
  if (/anexa.*[_\s-]?c/i.test(name)) return "anexa_c_template";
  if (/anexa.*[_\s-]?b/i.test(name)) return "anexa_b_template";
  if (/cerere.*finan[tț]|cererea/i.test(name)) return "cerere_finantare_template";
  if (/memoriu/i.test(name)) return "memoriu_template";
  if (fileType === "docx") return "memoriu_template";
  if (fileType === "pdf") return "cerere_finantare_template";
  return null;
}

async function extractPlaceholders(buffer: Buffer, fileName: string): Promise<Array<{
  key: string;
  pageNum: number;
  lineNum: number;
  context: string;
}>> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `template_${Date.now()}_${fileName}`);
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys, json, re

file_path = sys.argv[1]
ext = file_path.rsplit('.', 1)[-1].lower()

placeholders = []

if ext == 'docx':
    from docx import Document
    doc = Document(file_path)
    page_num = 1
    line_num = 0
    for para in doc.paragraphs:
        text = para.text
        line_num += 1
        for run in para.runs:
            if run._element.xml.find('w:br') != -1 and 'type="page"' in run._element.xml:
                page_num += 1
                line_num = 0
        matches = re.finditer(r'\\{\\{([^}]+)\\}\\}', text)
        for m in matches:
            start = max(0, m.start() - 50)
            end = min(len(text), m.end() + 50)
            context = text[start:end]
            placeholders.append({
                "key": m.group(1).strip(),
                "pageNum": page_num,
                "lineNum": line_num,
                "context": context
            })

    for table_idx, table in enumerate(doc.tables):
        for row_idx, row in enumerate(table.rows):
            for cell_idx, cell in enumerate(row.cells):
                text = cell.text
                matches = re.finditer(r'\\{\\{([^}]+)\\}\\}', text)
                for m in matches:
                    placeholders.append({
                        "key": m.group(1).strip(),
                        "pageNum": page_num,
                        "lineNum": line_num + 1000 + table_idx * 100 + row_idx,
                        "context": f"Tabel {table_idx+1}, Rand {row_idx+1}, Celula {cell_idx+1}: {text[:80]}"
                    })

elif ext == 'xlsx':
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    for sheet_idx, sheet in enumerate(wb.sheetnames):
        ws = wb[sheet]
        for row_idx, row in enumerate(ws.iter_rows(values_only=False), 1):
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    matches = re.finditer(r'\\{\\{([^}]+)\\}\\}', cell.value)
                    for m in matches:
                        placeholders.append({
                            "key": m.group(1).strip(),
                            "pageNum": sheet_idx + 1,
                            "lineNum": row_idx,
                            "context": f"Sheet '{sheet}', {cell.coordinate}: {cell.value[:80]}"
                        })

print(json.dumps(placeholders))
`;

  const scriptPath = path.join(tmpDir, `extract_tmpl_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    const { execFileSync } = await import("child_process");
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

async function classifyElements(
  placeholders: Array<{ key: string; context: string }>,
  model: string,
  tokenUsage?: { input: number; output: number },
): Promise<Array<{ key: string; label: string; fieldType: string }>> {
  if (placeholders.length === 0) return [];

  const { safeJSONParse } = await import("../lib/safeExtract");

  const response = await withAILimit(() => anthropic.messages.create({
    model,
    max_tokens: 6000, // Increased from 4000 for templates with many fields
    system: `Ești expert în formulare oficiale pentru dosare de finanțare europeană. Clasifici câmpuri placeholder din template-uri (cereri de finanțare, memorii justificative, anexe financiare, checklisturi, declarații).

CUM GÂNDEȘTI:
- Fiecare placeholder are un SENS precis în contextul dosarului — "nr_reg_com" nu e un câmp generic ci "Număr înregistrare Registrul Comerțului"
- fieldType trebuie ales CORECT: un CUI e "text" (nu number — are checksum), o valoare în lei e "number", un obiectiv de proiect e "textarea", o dată emitere e "date"
- Label-ul trebuie să fie EXACT ce ar vedea consultantul: profesional, în română, descriptiv (nu "camp 1" ci "Denumire completă solicitant")
- Contextul placeholder-ului (textul din jur) e CRUCIAL — "___" lângă "Data:" = date, "___" lângă "Semnătura:" = signature

TIPURI câmpuri:
- text: date scurte (CUI, serie CI, IBAN, CAEN, nume, adresă)
- number: valori numerice (sume, procente, suprafețe, nr. angajați)
- textarea: texte lungi (descrieri, obiective, justificări, metodologii)
- date: date calendaristice (dd.mm.yyyy)
- table: secțiuni tabulare (buget, plan investiții, grafic activități)
- signature: zone de semnătură/ștampilă
- select: câmpuri cu opțiuni predefinite (DA/NU, forma juridică, regiune)

Returnează DOAR JSON valid — array de obiecte.`,
    messages: [{
      role: "user",
      content: `Clasifică aceste câmpuri placeholder din template-ul de document de finanțare:
${JSON.stringify(placeholders.map(p => ({ key: p.key, context: p.context })), null, 2)}

Returnează:
[{ "key": "...", "label": "Label descriptiv profesional în română", "fieldType": "text|number|textarea|date|table|signature|select" }]`
    }],
  }));

  // Track actual token usage for this call
  if (tokenUsage) {
    tokenUsage.input += response.usage.input_tokens;
    tokenUsage.output += response.usage.output_tokens;
  }

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";

  if (response.stop_reason === "max_tokens") {
    console.warn(`[processTemplate] Classification truncated at ${text.length} chars for ${placeholders.length} fields`);
  }

  const parsed = safeJSONParse(text, "processTemplate_classify");
  if (parsed && Array.isArray(parsed.data)) {
    return parsed.data;
  }

  console.warn(`[processTemplate] AI label classification failed — using auto-generated labels for ${placeholders.length} fields`);
  return placeholders.map(p => ({
    key: p.key,
    label: p.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    fieldType: "text",
  }));
}

/**
 * Detect COMPOSE: and TABLE: markers in a DOCX/XLSX template.
 * These markers indicate sections where Neemia should generate content.
 * Format: COMPOSE:section_key or TABLE:table_key
 */
async function detectComposeSections(buffer: Buffer, fileName: string): Promise<Array<{
  marker: string;
  type: "narrative" | "table" | "calculation";
  label: string;
}>> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `compose_${Date.now()}_${fileName}`);
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys, json, re

file_path = sys.argv[1]
ext = file_path.rsplit('.', 1)[-1].lower()

markers = []

if ext == 'docx':
    from docx import Document
    doc = Document(file_path)
    for para in doc.paragraphs:
        text = para.text.strip()
        m = re.match(r'(COMPOSE|TABLE|CALC):([\\w_]+)', text)
        if m:
            mtype = m.group(1)
            mkey = m.group(2)
            label = mkey.replace('_', ' ').title()
            section_type = 'narrative' if mtype == 'COMPOSE' else 'table' if mtype == 'TABLE' else 'calculation'
            markers.append({
                "marker": f"{mtype}:{mkey}",
                "type": section_type,
                "label": label
            })
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                text = cell.text.strip()
                m = re.match(r'(COMPOSE|TABLE|CALC):([\\w_]+)', text)
                if m:
                    mtype = m.group(1)
                    mkey = m.group(2)
                    label = mkey.replace('_', ' ').title()
                    section_type = 'narrative' if mtype == 'COMPOSE' else 'table' if mtype == 'TABLE' else 'calculation'
                    markers.append({
                        "marker": f"{mtype}:{mkey}",
                        "type": section_type,
                        "label": label
                    })

elif ext == 'xlsx':
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        for row in ws.iter_rows(values_only=False):
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    text = cell.value.strip()
                    m = re.match(r'(COMPOSE|TABLE|CALC):([\\w_]+)', text)
                    if m:
                        mtype = m.group(1)
                        mkey = m.group(2)
                        label = mkey.replace('_', ' ').title()
                        section_type = 'narrative' if mtype == 'COMPOSE' else 'table' if mtype == 'TABLE' else 'calculation'
                        markers.append({
                            "marker": f"{mtype}:{mkey}",
                            "type": section_type,
                            "label": label
                        })

# Deduplicate
seen = set()
unique = []
for m in markers:
    if m['marker'] not in seen:
        seen.add(m['marker'])
        unique.append(m)

print(json.dumps(unique))
`;

  const scriptPath = path.join(tmpDir, `compose_detect_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    const { execFileSync } = await import("child_process");
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

/**
 * Convert DOCX to PDF using LibreOffice (headless) for visual field detection.
 * Returns null if LibreOffice is not available.
 */
async function convertDocxToPdf(buffer: Buffer): Promise<Buffer | null> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const crypto = await import("crypto");

  const tmpDir = os.tmpdir();
  const id = crypto.randomUUID();
  const inputPath = path.join(tmpDir, `convert_${id}.docx`);
  const outDir = path.join(tmpDir, `convert_out_${id}`);
  fs.writeFileSync(inputPath, buffer);
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const { execFileSync: execFileSync2 } = await import("child_process");
    execFileSync2("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });

    const pdfFiles = fs.readdirSync(outDir).filter((f: string) => f.endsWith(".pdf"));
    if (pdfFiles.length === 0) return null;

    return fs.readFileSync(path.join(outDir, pdfFiles[0]));
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.rmSync(outDir, { recursive: true }); } catch {}
  }
}

export const processTemplateWorker = new Worker<ProcessTemplatePayload>(
  "process-template",
  async (job: Job<ProcessTemplatePayload>) => {
    const { documentId, organizationId } = job.data;

    // ─── DB PREFLIGHT CHECK (before any AI calls) ───
    const check = await preflightCached(db, "processTemplate");
    if (!check.ready) {
      console.error("[processTemplate] Preflight FAILED", { operation: "processTemplate", missing: check.missing });
      publishEvent(`org:${organizationId}:uploads`, "processing_error", {
        documentId,
        message: check.message,
      }).catch((e: any) => console.warn("[processTemplate] sse preflight error:", e.message));
      throw new Error(`DB preflight failed: ${check.message}`);
    }

    // Track actual token usage for AI cost logging
    const classifyTokenUsage = { input: 0, output: 0 };

    try {
      await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const isCompose = doc.generationMode === "compose";

      const { buffer, name } = await getFileBuffer(doc.fileId);

      let uniqueElements: Array<{
        documentId: string;
        organizationId: string;
        key: string;
        label: string;
        fieldType: any;
        pageNum: number;
        lineNum: number;
        group?: string;
        isRepeating?: boolean;
        rowIndex?: number | null;
        detected: boolean;
        validated: boolean;
      }> = [];

      let visualCrossCheckStats: { textOnly: number; visualOnly: number; both: number; total: number } | null = null;

      if (doc.fileType === "pdf") {
        // ─── PDF: XFA extraction (no visual detection — XFA PDFs render as "Please wait...") ───
        await job.updateProgress(10);
        publishJobProgress(organizationId, {
          jobId: job.id || "", jobType: "template", documentId,
          documentName: doc.name, progress: 10, status: "processing",
          message: `Extragere câmpuri XFA din "${doc.name}"...`,
        }).catch((e: any) => console.warn("[processTemplate] sse xfa progress:", e.message));

        const { extractXFAFields } = await import("../services/xfaFiller");
        const xfaFields = await extractXFAFields(buffer);

        await job.updateProgress(50);
        publishJobProgress(organizationId, {
          jobId: job.id || "", jobType: "template", documentId,
          documentName: doc.name, progress: 50, status: "processing",
          message: `XFA: ${xfaFields.length} câmpuri extrase programatic (zero AI cost).`,
        }).catch((e: any) => console.warn("[processTemplate] sse xfa count:", e.message));

        if (xfaFields.length > 0) {
          console.log(`[processTemplate] PDF XFA: ${xfaFields.length} câmpuri extrase programatic, skip detectFieldsVisually()`);

          // Convert XFA fields directly to template elements
          const seen = new Set<string>();
          uniqueElements = xfaFields
            .filter(f => {
              if (seen.has(f.key)) return false;
              seen.add(f.key);
              return true;
            })
            .map((f, idx) => ({
              documentId,
              organizationId,
              key: f.key,
              label: f.label,
              fieldType: (f.fieldType === "checkbox" ? "select" : f.fieldType) as any,
              pageNum: 1,
              lineNum: idx,
              group: f.group || "general",
              isRepeating: false,
              rowIndex: null,
              detected: true,
              validated: true, // XFA fields are structurally certain
            }));
        } else {
          // FIX F3.1: Fallback to visual detection for non-XFA PDFs
          console.log(`[processTemplate] No XFA fields, falling back to visual detection`);
          publishJobProgress(organizationId, {
            jobId: job.id || "", jobType: "template", documentId,
            documentName: doc.name, progress: 40, status: "processing",
            message: `PDF fără XFA — detecție vizuală cu Claude Vision...`,
          }).catch((e: any) => console.warn("[processTemplate] sse visual detection progress:", e.message));
          try {
            const visualFields = await detectFieldsVisually(buffer);
            uniqueElements = visualFields.map((f, idx) => ({
              documentId,
              organizationId,
              key: f.key,
              label: f.label || f.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
              fieldType: (f.fieldType || "text") as any,
              pageNum: f.page || 1,
              lineNum: idx,
              group: "general",
              isRepeating: false,
              rowIndex: null,
              detected: true,
              validated: false,
            }));
          } catch (visErr) {
            console.warn(`[processTemplate] Visual detection failed for PDF "${doc.name}":`, visErr);
            publishJobProgress(organizationId, {
              jobId: job.id || "", jobType: "template", documentId,
              documentName: doc.name, progress: 50, status: "processing",
              message: `Detecția vizuală nu a funcționat — se continuă doar cu extracția text`,
            }).catch((e: any) => console.warn("[processTemplate] sse visual fallback:", e.message));
          }
        }

      } else {
        // ─── DOCX/XLSX: text placeholder extraction + optional visual cross-check ───
        await job.updateProgress(10);
        publishJobProgress(organizationId, {
          jobId: job.id || "", jobType: "template", documentId,
          documentName: doc.name, progress: 10, status: "processing",
          message: `Extragere placeholder-e din "${doc.name}"...`,
        }).catch((e: any) => console.warn("[processTemplate] sse placeholder progress:", e.message));

        const placeholders = await extractPlaceholders(buffer, name);

        await job.updateProgress(30);

        // Try to convert DOCX to PDF for visual cross-check
        let visualFields: Awaited<ReturnType<typeof detectFieldsVisually>> = [];
        if (doc.fileType === "docx") {
          try {
            const pdfBuffer = await convertDocxToPdf(buffer);
            if (pdfBuffer) {
              publishJobProgress(organizationId, {
                jobId: job.id || "", jobType: "template", documentId,
                documentName: doc.name, progress: 40, status: "processing",
                message: `Scanare vizuală Claude Vision pe "${doc.name}"...`,
              }).catch((e: any) => console.warn("[processTemplate] sse visual scan progress:", e.message));
              visualFields = await detectFieldsVisually(pdfBuffer);
            }
          } catch (err) {
            console.warn(`[processTemplate] DOCX→PDF conversion failed, skipping visual detection:`, err);
          }
        }

        await job.updateProgress(55);
        const classified = placeholders.length > 0
          ? await classifyElements(placeholders, "claude-sonnet-4-6", classifyTokenUsage)
          : [];

        await job.updateProgress(70);

        // Build text fields
        const textFields = placeholders.map(p => {
          const cls = classified.find(c => c.key === p.key);
          return {
            key: p.key,
            label: cls?.label || p.key.replace(/_/g, " "),
            fieldType: cls?.fieldType || "text",
            pageNum: p.pageNum,
          };
        });

        if (visualFields.length > 0) {
          // Cross-check text placeholders with visual detection
          const { merged, stats } = crossCheckFields(textFields, visualFields);
          visualCrossCheckStats = stats;

          console.log(`[processTemplate] DOCX cross-check: ${stats.both} matched, ${stats.textOnly} text-only, ${stats.visualOnly} visual-only (total: ${stats.total})`);

          uniqueElements = merged.map((m, idx) => ({
            documentId,
            organizationId,
            key: m.key,
            label: m.label,
            fieldType: m.fieldType as any,
            pageNum: m.pageNum,
            lineNum: idx,
            detected: true,
            validated: m.source === "both",
          }));
        } else {
          // No visual fields — use text-only (original behavior)
          if (placeholders.length === 0) {
            await db.update(documents).set({
              status: "processed",
              processedAt: new Date(),
            }).where(eq(documents.id, documentId));
            return;
          }

          uniqueElements = textFields.map((tf, idx) => ({
            documentId,
            organizationId,
            key: tf.key,
            label: tf.label,
            fieldType: tf.fieldType as any,
            pageNum: tf.pageNum,
            lineNum: idx,
            detected: true,
            validated: false,
          }));
        }

        // Deduplicate by key
        uniqueElements = uniqueElements.filter((el, idx) =>
          uniqueElements.findIndex(e => e.key === el.key) === idx
        );
      }

      if (uniqueElements.length > 0) {
        await db.insert(templateElements).values(uniqueElements);
      }

      // For compose mode: detect COMPOSE: and TABLE: markers in the document
      if (isCompose && doc.fileType === "pdf") {
        console.warn(`[processTemplate] Compose mode not supported for PDF templates — skipping marker detection for "${doc.name}"`);
        publishJobProgress(organizationId, {
          jobId: job.id || "", jobType: "template", documentId,
          documentName: doc.name, progress: 75, status: "processing",
          message: `Modul Compose nu este suportat pentru PDF. Folosiți DOCX/XLSX pentru documente cu secțiuni generate AI.`,
        }).catch((e: any) => console.warn("[processTemplate] sse compose warning:", e.message));
      }
      if (isCompose && (doc.fileType === "docx" || doc.fileType === "xlsx")) {
        try {
          const composeSections = await detectComposeSections(buffer, name);
          if (composeSections.length > 0) {
            await db.update(documents).set({
              composeConfig: { sections: composeSections } as any,
            }).where(eq(documents.id, documentId));
            console.log(`[processTemplate] Detected ${composeSections.length} compose sections in "${doc.name}"`);
          }
        } catch (err) {
          console.error(`[processTemplate] Compose section detection failed for ${documentId}:`, err);
        }
      }

      // Auto-map template placeholders to element_definitions (if any exist)
      let mappedCount = 0;
      if (uniqueElements.length > 0) {
        try {
          mappedCount = await autoMapTemplatePlaceholders(documentId, organizationId);
          console.log(`[processTemplate] Auto-mapped ${mappedCount}/${uniqueElements.length} placeholders to element_definitions`);
        } catch (err) {
          console.error(`[processTemplate] Auto-map failed for ${documentId}:`, err);
        }
      }

      const maxPage = uniqueElements.length > 0
        ? Math.max(...uniqueElements.map(e => e.pageNum), 1)
        : 1;

      // Re-classify documentTypeClass based on extracted field content
      const refinedTypeClass = classifyTemplateFromContent(
        uniqueElements.map(e => e.key),
        doc.name,
        doc.fileType || "",
      );

      await db.update(documents).set({
        status: "processed",
        pageCount: maxPage,
        processedAt: new Date(),
        ...(refinedTypeClass ? { documentTypeClass: refinedTypeClass as any } : {}),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      await logAIUsage({
        organizationId,
        agent: "template_mapping",
        model: "claude-sonnet-4-6",
        tokensInput: classifyTokenUsage.input,
        tokensOutput: classifyTokenUsage.output,
        action: "classify_template_elements",
      });

      // SSE notification
      const crossCheckMsg = visualCrossCheckStats
        ? ` Visual cross-check: ${visualCrossCheckStats.both} confirmate, ${visualCrossCheckStats.visualOnly} doar vizual, ${visualCrossCheckStats.textOnly} doar text.`
        : "";
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "template",
        elementsCount: uniqueElements.length,
        mappedToDefinitions: mappedCount,
        visualCrossCheck: visualCrossCheckStats,
        message: `Template procesat "${doc.name}". ${uniqueElements.length} câmpuri detectate, ${mappedCount} mapate la definiții.${crossCheckMsg}`,
      }).catch((e: any) => console.warn("[processTemplate] sse document processed:", e.message));

    } catch (error) {
      console.error(`Process template error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      const errorMsg = error instanceof Error ? error.message : "Eroare necunoscută";
      await db.update(documents).set({ status: docStatus as any, processingError: errorMsg }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        errorMessage: errorMsg,
        message: isLastAttempt
          ? `Eroare la procesarea template-ului (toate ${job.opts.attempts || 3} încercări eșuate): ${errorMsg}`
          : `Eroare la procesarea template-ului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă): ${errorMsg}`,
      }).catch((e: any) => console.warn("[processTemplate] sse document failed:", e.message));
      throw error;
    }
  },
  { connection: redis as any }
);
