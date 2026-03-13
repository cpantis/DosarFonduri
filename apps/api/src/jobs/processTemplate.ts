import { Worker, Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { documents, templateElements } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent } from "../lib/sse";
import { autoMapTemplatePlaceholders } from "../services/elementDefinitionService";

const anthropic = new Anthropic();

interface ProcessTemplatePayload {
  documentId: string;
  organizationId: string;
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
    const result = execSync(`python3 ${scriptPath} ${inputPath}`, {
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
): Promise<Array<{ key: string; label: string; fieldType: string }>> {
  if (placeholders.length === 0) return [];

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system: `Clasifica fiecare camp placeholder dintr-un template de document de finantare.
Pentru fiecare, returneaza label descriptiv in romana si tipul campului.
Returneaza DOAR JSON valid — array de obiecte.`,
    messages: [{
      role: "user",
      content: `Clasifica aceste campuri:
${JSON.stringify(placeholders.map(p => ({ key: p.key, context: p.context })), null, 2)}

Returneaza:
[{ "key": "...", "label": "Label descriptiv in romana", "fieldType": "text|number|textarea|date|table|signature|select" }]`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return placeholders.map(p => ({
      key: p.key,
      label: p.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      fieldType: "text",
    }));
  }
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
    const result = execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

export const processTemplateWorker = new Worker<ProcessTemplatePayload>(
  "process-template",
  async (job: Job<ProcessTemplatePayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

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

      if (doc.fileType === "pdf") {
        await job.updateProgress(20);

        const { extractXFAFields } = await import("../services/xfaFiller");
        const xfaFields = await extractXFAFields(buffer);

        await job.updateProgress(60);

        uniqueElements = xfaFields.map((f, idx) => ({
          documentId,
          organizationId,
          key: f.key,
          label: f.label,
          fieldType: (f.fieldType === "checkbox" ? "select" : f.fieldType) as any,
          pageNum: 1,
          lineNum: idx,
          group: f.group || "general",
          isRepeating: f.isRepeating || false,
          rowIndex: f.rowIndex ?? null,
          detected: true,
          validated: false,
        }));

        const seen = new Set<string>();
        uniqueElements = uniqueElements.filter(el => {
          if (seen.has(el.key)) return false;
          seen.add(el.key);
          return true;
        });

      } else {
        await job.updateProgress(20);
        const placeholders = await extractPlaceholders(buffer, name);

        if (placeholders.length === 0) {
          await db.update(documents).set({
            status: "processed",
            processedAt: new Date(),
          }).where(eq(documents.id, documentId));
          return;
        }

        await job.updateProgress(50);
        const classified = await classifyElements(placeholders, "claude-sonnet-4-20250514");

        await job.updateProgress(70);
        const elements = placeholders.map(p => {
          const cls = classified.find(c => c.key === p.key);
          return {
            documentId,
            organizationId,
            key: p.key,
            label: cls?.label || p.key.replace(/_/g, " "),
            fieldType: (cls?.fieldType || "text") as any,
            pageNum: p.pageNum,
            lineNum: p.lineNum,
            detected: true,
            validated: false,
          };
        });

        uniqueElements = elements.filter((el, idx) =>
          elements.findIndex(e => e.key === el.key) === idx
        );
      }

      if (uniqueElements.length > 0) {
        await db.insert(templateElements).values(uniqueElements);
      }

      // For compose mode: detect COMPOSE: and TABLE: markers in the document
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

      await db.update(documents).set({
        status: "processed",
        pageCount: maxPage,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      await logAIUsage({
        organizationId,
        agent: "ghid_rules",
        model: "claude-sonnet-4-20250514",
        tokensInput: 0,
        tokensOutput: 0,
        action: "classify_template_elements",
      });

      // SSE notification
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "template",
        elementsCount: uniqueElements.length,
        mappedToDefinitions: mappedCount,
        message: `Template procesat "${doc.name}". ${uniqueElements.length} câmpuri detectate, ${mappedCount} mapate la definiții.`,
      }).catch(() => {});

    } catch (error) {
      console.error(`Process template error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      await db.update(documents).set({ status: docStatus as any }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        message: isLastAttempt
          ? `Eroare la procesarea template-ului (toate ${job.opts.attempts || 3} încercări eșuate): ${error instanceof Error ? error.message : "Eroare necunoscută"}`
          : `Eroare la procesarea template-ului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă): ${error instanceof Error ? error.message : "Eroare necunoscută"}`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
