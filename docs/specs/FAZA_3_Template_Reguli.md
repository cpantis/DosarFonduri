# FAZA 3 — Template-uri & Reguli
## Procesare Ghid → Reguli, Parsare Template → Elemente, Template Viewer, Validare

**Dependențe**: Faza 2 completă (Documente, Storage, OCR, Queue)

---

## 3.1 JOB: PROCESARE GHID → REGULI

### Worker BullMQ

```typescript
// apps/api/src/jobs/processGuide.ts
import { Worker, Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { documents, rules, orgConfig } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";

const anthropic = new Anthropic();

interface ProcessGuidePayload {
  documentId: string;
  organizationId: string;
}

// ═══ EXTRAGERE REGULI FIXE ═══
async function extractFixedRules(
  text: string,
  model: string,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: `Ești expert în fonduri europene și naționale din România. Analizezi ghiduri de finanțare și extragi REGULI FIXE — condiții binare, verificabile automat cu date din certificat constatator, bilanț sau alte surse oficiale.

REGULI FIXE = condiții cu răspuns DA/NU:
- Plafoane numerice (cifra afaceri min/max, angajați min, capital social min)
- Forme juridice eligibile/neeligibile
- Coduri CAEN eligibile
- Vechime minimă firmă (ani de la înființare)
- Zone geografice eligibile (județe, UAT-uri)
- Dimensiune fermă (SO minim/maxim)
- Valoare investiție min/max
- Cofinanțare minimă (%)
- Restricții stare firmă (nu în insolvență, nu radiată)

Returnează DOAR JSON valid — array de obiecte. Fără backticks, fără explicații.`,
    messages: [{
      role: "user",
      content: `Extrage TOATE regulile fixe din acest ghid de finanțare.

Pentru fiecare regulă returnează:
{
  "category": "eligibilitate" | "financiar" | "tehnic" | "administrativ",
  "description": "Descriere clară a regulii",
  "condition": {
    "field": "câmpul verificat (ex: cifra_afaceri, forma_juridica, cod_caen, angajati, vechime_ani)",
    "operator": "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "between",
    "value": "valoarea de comparare",
    "value2": "pentru between - limita superioară (opțional)"
  },
  "source_page": number,
  "source_text": "textul exact din ghid care definește regula",
  "confidence": 0.0 - 1.0
}

TEXT GHID:
${text.slice(0, 100000)}`
    }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse fixed rules JSON");
    parsed = [];
  }

  // Salvare reguli
  if (parsed.length > 0) {
    await db.insert(rules).values(
      parsed.map((r: any) => ({
        documentId,
        organizationId,
        type: "fixed" as const,
        category: r.category || "eligibilitate",
        description: r.description,
        condition: r.condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: r.confidence?.toString() || "0.90",
      }))
    );
  }

  // Log AI usage
  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_fixed_rules",
  });
}

// ═══ EXTRAGERE REGULI INTERPRETATE ═══
async function extractInterpretedRules(
  text: string,
  model: string,
  useET: boolean,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Extrage REGULILE INTERPRETATE din acest ghid de finanțare — reguli care necesită judecată, arbori decizionali, sau context suplimentar.

REGULI INTERPRETATE = condiții complexe:
- Intensitatea sprijinului (% finanțare nerambursabilă) bazată pe mai mulți factori
- Criterii de selecție cu punctaje (grile de punctare)
- Condiții cumulative (trebuie îndeplinite toate din listă)
- Excepții și cazuri speciale
- Definiții interpretabile (ex: "exploatație agricolă viabilă")
- Cerințe documentare condiționate (documentul X e necesar doar dacă...)
- Restricții temporale complexe (ex: "în ultimii 3 ani fiscali")

Pentru fiecare regulă returnează:
{
  "category": "selecție" | "intensitate" | "eligibilitate_complexă" | "documentare",
  "description": "Descriere detaliată",
  "condition": {
    "type": "decision_tree" | "scoring" | "cumulative" | "conditional",
    "logic": "descriere structurată a logicii decizionale",
    "factors": ["factor1", "factor2"],
    "outcomes": [{"if": "condiție", "then": "rezultat"}]
  },
  "source_page": number,
  "source_text": "textul exact din ghid",
  "confidence": 0.0 - 1.0,
  "needs_review": true/false,
  "review_reason": "de ce necesită verificare umană"
}

TEXT GHID:
${text.slice(0, 100000)}`
  }];

  const requestParams: any = {
    model,
    max_tokens: 12000,
    system: `Ești expert senior în fonduri europene cu 15+ ani experiență. Analizezi ghiduri de finanțare și extragi reguli complexe, interpretate, care necesită arbori decizionali sau judecată profesională.

Fii EXHAUSTIV — o regulă ratată poate însemna un dosar respins.
Marchează cu needs_review: true regulile unde ai dubii.
Returnează DOAR JSON valid — array de obiecte.`,
    messages,
  };

  // Extended Thinking dacă e activat
  if (useET) {
    requestParams.thinking = {
      type: "enabled",
      budget_tokens: 10000,
    };
  }

  const response = await anthropic.messages.create(requestParams);

  // Extrage text din răspuns (skip thinking blocks)
  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? (textBlock as any).text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse interpreted rules JSON");
    parsed = [];
  }

  if (parsed.length > 0) {
    await db.insert(rules).values(
      parsed.map((r: any) => ({
        documentId,
        organizationId,
        type: "interpreted" as const,
        category: r.category || "selecție",
        description: r.description,
        condition: r.condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: r.confidence?.toString() || "0.75",
        // Auto-flag pentru review dacă confidence < threshold
        validated: false,
      }))
    );
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_interpreted_rules",
  });
}

// ═══ WORKER ═══
export const processGuideWorker = new Worker<ProcessGuidePayload>(
  "process-guide",
  async (job: Job<ProcessGuidePayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      // Update status
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

      // Get document + file
      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // Extract text — format-aware
      let text = "";
      if (doc.fileType === "pdf") {
        text = await extractTextFromPDF(buffer);
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else {
        throw new Error(`Format nesuportat pentru ghid: ${doc.fileType}`);
      }

      // Get org config for model selection
      const config = await db.query.orgConfig.findFirst({
        where: eq(orgConfig.organizationId, organizationId),
      });

      const fixedModel = config?.reguliFixeModel || "claude-sonnet-4-20250514";
      const interpModel = config?.reguliInterpModel || "claude-opus-4-6";
      const useET = config?.reguliInterpET ?? true;

      // Extragere reguli fixe (Sonnet — rapid, precis)
      await job.updateProgress(30);
      await extractFixedRules(text, fixedModel, documentId, organizationId);

      // Extragere reguli interpretate (Opus + ET — complex)
      await job.updateProgress(60);
      await extractInterpretedRules(text, interpModel, useET, documentId, organizationId);

      // Update page count + status
      const pageCount = (text.match(/--- Pagina/g) || []).length;
      await db.update(documents).set({
        status: "processed",
        pageCount,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);
    } catch (error) {
      console.error("Process guide error:", error);
      await db.update(documents).set({ status: "error" }).where(eq(documents.id, documentId));
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
```

### AI Usage Logger

```typescript
// apps/api/src/services/aiUsage.ts
import { db } from "../db";
import { aiUsageLog } from "../db/schema";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-opus-4-6": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
};

export async function logAIUsage(params: {
  organizationId: string;
  projectId?: string;
  userId?: string;
  agent: "solomon" | "neemia" | "ghid_rules" | "ocr";
  model: string;
  tokensInput: number;
  tokensOutput: number;
  action: string;
}) {
  const pricing = MODEL_COSTS[params.model] || { input: 0.01 / 1000, output: 0.03 / 1000 };
  const cost = (params.tokensInput * pricing.input) + (params.tokensOutput * pricing.output);

  await db.insert(aiUsageLog).values({
    organizationId: params.organizationId,
    projectId: params.projectId,
    userId: params.userId || "system",
    agent: params.agent,
    model: params.model,
    tokensInput: params.tokensInput,
    tokensOutput: params.tokensOutput,
    cost: cost.toFixed(6),
    action: params.action,
  });
}
```

---

## 3.2 JOB: PROCESARE TEMPLATE → ELEMENTE

```typescript
// apps/api/src/jobs/processTemplate.ts
import { Worker, Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { documents, templateElements } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { logAIUsage } from "../services/aiUsage";

const anthropic = new Anthropic();

interface ProcessTemplatePayload {
  documentId: string;
  organizationId: string;
}

// Parsare DOCX — extrage {{placeholder}} cu python-docx
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
        # Check for page break
        for run in para.runs:
            if run._element.xml.find('w:br') != -1 and 'type="page"' in run._element.xml:
                page_num += 1
                line_num = 0
        # Find {{placeholders}}
        matches = re.finditer(r'\\{\\{([^}]+)\\}\\}', text)
        for m in matches:
            # Get surrounding context (50 chars each side)
            start = max(0, m.start() - 50)
            end = min(len(text), m.end() + 50)
            context = text[start:end]
            placeholders.append({
                "key": m.group(1).strip(),
                "pageNum": page_num,
                "lineNum": line_num,
                "context": context
            })

    # Also check tables
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
                        "context": f"Tabel {table_idx+1}, Rând {row_idx+1}, Celulă {cell_idx+1}: {text[:80]}"
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
    fs.unlinkSync(inputPath);
    fs.unlinkSync(scriptPath);
  }
}

// Claude clasifică tipul și generează label pentru fiecare câmp
async function classifyElements(
  placeholders: Array<{ key: string; context: string }>,
  model: string,
): Promise<Array<{ key: string; label: string; fieldType: string }>> {
  if (placeholders.length === 0) return [];

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system: `Clasifică fiecare câmp placeholder dintr-un template de document de finanțare.
Pentru fiecare, returnează label descriptiv în română și tipul câmpului.
Returnează DOAR JSON valid — array de obiecte.`,
    messages: [{
      role: "user",
      content: `Clasifică aceste câmpuri:
${JSON.stringify(placeholders.map(p => ({ key: p.key, context: p.context })), null, 2)}

Returnează:
[{ "key": "...", "label": "Label descriptiv în română", "fieldType": "text|number|textarea|date|table|signature|select" }]`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: generează label-uri simple din key
    return placeholders.map(p => ({
      key: p.key,
      label: p.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      fieldType: "text",
    }));
  }
}

// ═══ WORKER ═══
export const processTemplateWorker = new Worker<ProcessTemplatePayload>(
  "process-template",
  async (job: Job<ProcessTemplatePayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name } = await getFileBuffer(doc.fileId);

      let uniqueElements: Array<{
        documentId: string;
        organizationId: string;
        key: string;
        label: string;
        fieldType: any;
        pageNum: number;
        lineNum: number;
        detected: boolean;
        validated: boolean;
      }> = [];

      // ═══ DETECTARE FORMAT + EXTRAGERE CÂMPURI ═══
      if (doc.fileType === "pdf") {
        // ─── PDF XFA (Cereri AFIR, formulare LiveCycle) ───
        await job.updateProgress(20);

        const { extractXFAFields } = await import("../services/xfaFiller");
        const xfaFields = await extractXFAFields(buffer);

        await job.updateProgress(60);

        // Filtrarea se face deja în Python (skip pdfVersion, etc.)
        // Aici doar mapăm la structura DB
        uniqueElements = xfaFields.map((f, idx) => ({
          documentId,
          organizationId,
          key: f.key,                          // "general.NumeSolicitant" sau "B1.VanzariFizicePrevizionate[0].Categ"
          label: f.label,
          fieldType: (f.fieldType === "checkbox" ? "select" : f.fieldType) as any,
          pageNum: 1,
          lineNum: idx,
          group: f.group || "general",         // secțiunea XFA
          isRepeating: f.isRepeating || false,  // câmp din tabel repetitiv
          rowIndex: f.rowIndex ?? null,          // index rând
          detected: true,
          validated: false,
        }));

        // Deduplicate by key (XFA paths sunt unice datorită indexului)
        const seen = new Set<string>();
        uniqueElements = uniqueElements.filter(el => {
          if (seen.has(el.key)) return false;
          seen.add(el.key);
          return true;
        });

      } else {
        // ─── DOCX / XLSX ({{placeholder}} pattern) ───
        await job.updateProgress(20);
        const placeholders = await extractPlaceholders(buffer, name);

        if (placeholders.length === 0) {
          await db.update(documents).set({
            status: "processed",
            processedAt: new Date(),
          }).where(eq(documents.id, documentId));
          return;
        }

        // Clasificare cu Claude
        await job.updateProgress(50);
        const classified = await classifyElements(placeholders, "claude-sonnet-4-20250514");

        // Merge placeholder positions cu clasificări
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

        // Deduplicate by key (same key pe pagini diferite — păstrăm prima apariție)
        uniqueElements = elements.filter((el, idx) =>
          elements.findIndex(e => e.key === el.key) === idx
        );
      }

      // ═══ SALVARE ELEMENTE ÎN DB ═══
      if (uniqueElements.length > 0) {
        await db.insert(templateElements).values(uniqueElements);
      }

      // Update status + page count
      const maxPage = Math.max(...placeholders.map(p => p.pageNum), 1);
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
        tokensInput: 0, // clasificare
        tokensOutput: 0,
        action: "classify_template_elements",
      });

    } catch (error) {
      console.error("Process template error:", error);
      await db.update(documents).set({ status: "error" }).where(eq(documents.id, documentId));
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
```

---

## 3.3 ROUTES REGULI

```typescript
// apps/api/src/routes/rules.ts
import { Hono } from "hono";
import { db } from "../db";
import { rules } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";

export const ruleRoutes = new Hono();

// Lista reguli per document
ruleRoutes.get("/documents/:docId/rules", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const result = await db.query.rules.findMany({
    where: and(eq(rules.documentId, docId), eq(rules.organizationId, auth.organizationId!)),
    orderBy: (r, { asc }) => [asc(r.sourcePage), asc(r.createdAt)],
  });

  // Adaugă flag needs_review pe baza threshold-ului din config
  const config = await db.query.orgConfig.findFirst({
    where: (c, { eq }) => eq(c.organizationId, auth.organizationId!),
  });
  const threshold = parseFloat(config?.reviewThreshold?.toString() || "0.85");

  const enriched = result.map(r => ({
    ...r,
    needsReview: parseFloat(r.confidence?.toString() || "0") < threshold,
  }));

  return c.json(enriched);
});

// Validare / editare regulă
ruleRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db.update(rules).set({
    ...body,
    validatedBy: body.validated ? auth.userId : null,
    validatedAt: body.validated ? new Date() : null,
  }).where(
    and(eq(rules.id, id), eq(rules.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

// Ștergere regulă
ruleRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  await db.delete(rules).where(
    and(eq(rules.id, id), eq(rules.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});
```

---

## 3.4 ROUTES TEMPLATE ELEMENTS

```typescript
// apps/api/src/routes/templates.ts
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { templateElements } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";

export const templateRoutes = new Hono();

// Lista elemente per document template
templateRoutes.get("/documents/:docId/elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const result = await db.query.templateElements.findMany({
    where: and(
      eq(templateElements.documentId, docId),
      eq(templateElements.organizationId, auth.organizationId!),
    ),
    orderBy: (e, { asc }) => [asc(e.pageNum), asc(e.lineNum)],
  });

  return c.json(result);
});

// Adaugă element manual
const addElementSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  fieldType: z.enum(["text", "number", "textarea", "date", "table", "signature", "select"]),
  pageNum: z.number().int().min(1),
  lineNum: z.number().int().min(0),
});

templateRoutes.post("/documents/:docId/elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const body = addElementSchema.parse(await c.req.json());

  const [element] = await db.insert(templateElements).values({
    documentId: docId,
    organizationId: auth.organizationId!,
    key: body.key,
    label: body.label,
    fieldType: body.fieldType,
    pageNum: body.pageNum,
    lineNum: body.lineNum,
    detected: false, // manual
    validated: false,
  }).returning();

  return c.json(element, 201);
});

// Validare / editare element
templateRoutes.put("/elements/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db.update(templateElements).set({
    ...body,
    validatedBy: body.validated ? auth.userId : null,
  }).where(
    and(eq(templateElements.id, id), eq(templateElements.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

// Validare batch (toată pagina)
templateRoutes.put("/documents/:docId/elements/validate-page", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const { pageNum, validated } = await c.req.json();

  await db.update(templateElements).set({
    validated,
    validatedBy: validated ? auth.userId : null,
  }).where(
    and(
      eq(templateElements.documentId, docId),
      eq(templateElements.organizationId, auth.organizationId!),
      eq(templateElements.pageNum, pageNum),
    )
  );

  return c.json({ ok: true });
});

// Ștergere element (doar manual)
templateRoutes.delete("/elements/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const element = await db.query.templateElements.findFirst({
    where: and(eq(templateElements.id, id), eq(templateElements.organizationId, auth.organizationId!)),
  });
  if (!element) return c.json({ error: "Not found" }, 404);
  if (element.detected) return c.json({ error: "Nu poți șterge elemente extrase automat" }, 400);

  await db.delete(templateElements).where(eq(templateElements.id, id));
  return c.json({ ok: true });
});
```

---

## 3.5 TEMPLATE VIEWER (Frontend)

### Structura componentă

```
documents/template/[id]/page.tsx
├── TemplateViewer (layout principal)
│   ├── ElementChecklist (stânga — lista elemente)
│   │   ├── ElementCard (compact 2 linii)
│   │   └── AddElementForm
│   └── DocumentPreview (dreapta — preview pagină)
│       ├── PageBar (navigare + validare pagină)
│       └── PageContent (linii numerotate + placeholders)
```

### Referință UI: `04b_TemplateViewer.jsx`

**Comportament cheie:**
- Stânga = checklist (coloana de comandă)
- Dreapta = document (reacționează la selecție)
- Click element stânga → document scrollează automat la linia respectivă
- Pagina se schimbă automat în funcție de elementul selectat
- Elemente grupate pe pagină cu header "Pag. X — Titlu"
- Card element compact 2 linii:
  ```
  ● Label element                    fieldType
    key · Linia N                    ✓ Validat
  ```
- Dots: 🟢 validat, 🟡 extras automat nevalidat, 🟣 adăugat manual
- Numere linie subtile stil Notepad++ (clickabile în modul adăugare)
- Adăugare element: click pe nr. linie din document selectează poziția
- Sursă element manual = mereu "Adăugat manual" (fără dropdown)

### API calls necesare:
```
GET  /api/documents/:id           → detalii document + download URL
GET  /api/templates/documents/:id/elements  → lista elemente
POST /api/templates/documents/:id/elements  → adaugă manual
PUT  /api/templates/elements/:id            → validare/editare
DELETE /api/templates/elements/:id          → ștergere (doar manual)
PUT  /api/templates/documents/:id/elements/validate-page → batch validate
```

---

## 3.6 WORKER ENTRY

```typescript
// apps/api/src/jobs/worker.ts
import { processGuideWorker } from "./processGuide";
import { processTemplateWorker } from "./processTemplate";

console.log("Workers started:");
console.log("  - process-guide");
console.log("  - process-template");

// Graceful shutdown
process.on("SIGTERM", async () => {
  await processGuideWorker.close();
  await processTemplateWorker.close();
  process.exit(0);
});
```

### Package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "worker": "tsx src/jobs/worker.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:worker": "node dist/jobs/worker.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Railway deploy: 2 servicii separate
1. **API**: `npm run start`
2. **Worker**: `npm run start:worker`

---

## 3.7 DEPENDENȚE PYTHON

```
# requirements.txt (pentru worker-ul care rulează python)
PyMuPDF==1.24.0
python-docx==1.1.0
openpyxl==3.1.2
```

Instalare pe Railway:
```dockerfile
# Dockerfile extras pentru worker
RUN apt-get update && apt-get install -y python3 python3-pip
RUN pip3 install PyMuPDF python-docx openpyxl
```

---

## 3.8 CHECKLIST FAZA 3

- [ ] Job processGuide: extragere reguli fixe (Sonnet)
- [ ] Job processGuide: extragere reguli interpretate (Opus + ET)
- [ ] AI Usage logger cu calcul cost per model
- [ ] Job processTemplate: extragere `{{placeholder}}` din DOCX/XLSX (python-docx, openpyxl)
- [ ] Job processTemplate: extragere câmpuri XFA din PDF (PyMuPDF XML parsing)
- [ ] Job processTemplate: filtrare câmpuri interne PDF (skip pdfVersion, Button, etc.)
- [ ] Job processTemplate: clasificare câmpuri cu Claude (DOCX/XLSX)
- [ ] Job processTemplate: label generation din CamelCase pentru XFA (NumeSolicitant → "Nume Solicitant")
- [ ] Worker BullMQ entry point
- [ ] Routes reguli: lista per document, validare, editare, ștergere
- [ ] Routes template elements: lista, adaugă manual, validare, batch validate, ștergere
- [ ] Frontend: Template Viewer complet (04b_TemplateViewer.jsx referință)
- [ ] Frontend: checklist stânga cu scroll automat document
- [ ] Frontend: numere linie, adăugare element manual cu click pe linie
- [ ] Frontend: filtre (Toate / Nevalidate / Validate / Manual)
- [ ] Python dependencies (PyMuPDF, python-docx, openpyxl)
- [ ] Railway deploy config (API + Worker separat)
