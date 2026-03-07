# FAZA 6 — Neemia (Generare Documente)
## Completare Template-uri, Streaming Pagină cu Pagină, Download

**Dependențe**: Faza 5 completă (Solomon, Elemente populate)

---

## 6.1 SERVICE NEEMIA

```typescript
// apps/api/src/services/neemia.ts
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  projects, projectElements, projectDocuments, templateElements,
  documents, orgConfig,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getFileBuffer, uploadFile } from "./storage";
import { logAIUsage } from "./aiUsage";

const anthropic = new Anthropic();

interface GenerateDocParams {
  projectId: string;
  templateDocumentId: string;
  organizationId: string;
  userId: string;
}

// ═══ COMPLETARE DOCX ═══
// python-docx completează DOAR placeholder-urile, fără a altera structura/formatul
async function fillDocxTemplate(
  templateBuffer: Buffer,
  templateFileName: string,
  elements: Record<string, string>, // key → value
): Promise<Buffer> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `tmpl_${Date.now()}_${templateFileName}`);
  const outputPath = path.join(tmpDir, `filled_${Date.now()}_${templateFileName}`);
  const dataPath = path.join(tmpDir, `data_${Date.now()}.json`);

  fs.writeFileSync(inputPath, templateBuffer);
  fs.writeFileSync(dataPath, JSON.stringify(elements));

  const script = `
import sys, json
from docx import Document
from copy import deepcopy

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

doc = Document(template_path)

filled_pages = []
current_page = 1

def replace_in_paragraph(paragraph, data):
    """Înlocuiește {{key}} în paragraf păstrând formatarea run-urilor."""
    full_text = paragraph.text
    replacements_made = []
    
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        if placeholder in full_text:
            replacements_made.append(key)
    
    if not replacements_made:
        return replacements_made
    
    # Strategia: reconstruiește run-urile cu înlocuiri
    # Parcurge run-urile și construiește textul complet cu pozițiile
    runs_text = []
    for run in paragraph.runs:
        runs_text.append(run.text)
    
    combined = ''.join(runs_text)
    
    # Aplică înlocuirile pe textul combinat
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        combined = combined.replace(placeholder, str(value) if value else '')
    
    # Redistribuie textul în run-uri (păstrând formatarea primului run cu conținut)
    if paragraph.runs:
        # Pune tot textul în primul run, golește restul
        paragraph.runs[0].text = combined
        for run in paragraph.runs[1:]:
            run.text = ''
    
    return replacements_made

def replace_in_table(table, data):
    """Înlocuiește {{key}} în celulele tabelului."""
    all_replaced = []
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                replaced = replace_in_paragraph(paragraph, data)
                all_replaced.extend(replaced)
    return all_replaced

# Procesare paragrafe principale
all_filled = []
for para in doc.paragraphs:
    filled = replace_in_paragraph(para, data)
    all_filled.extend(filled)
    # Detectare page break
    for run in para.runs:
        if 'w:br' in run._element.xml and 'type="page"' in run._element.xml:
            current_page += 1

# Procesare tabele
for table in doc.tables:
    filled = replace_in_table(table, data)
    all_filled.extend(filled)

# Procesare headers și footers
for section in doc.sections:
    for header in [section.header, section.first_page_header]:
        if header:
            for para in header.paragraphs:
                replace_in_paragraph(para, data)
    for footer in [section.footer, section.first_page_footer]:
        if footer:
            for para in footer.paragraphs:
                replace_in_paragraph(para, data)

doc.save(output_path)

# Raport
unique_filled = list(set(all_filled))
print(json.dumps({
    "filled_count": len(unique_filled),
    "filled_keys": unique_filled,
    "total_pages": current_page
}))
`;

  const scriptPath = path.join(tmpDir, `fill_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    const result = execSync(`python3 ${scriptPath} ${inputPath} ${outputPath} ${dataPath}`, {
      encoding: "utf-8",
      timeout: 60000,
    });

    const report = JSON.parse(result.trim());
    const filledBuffer = fs.readFileSync(outputPath);

    return filledBuffer;
  } finally {
    // Cleanup
    [inputPath, outputPath, dataPath, scriptPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });
  }
}

// ═══ COMPLETARE XLSX ═══
async function fillXlsxTemplate(
  templateBuffer: Buffer,
  templateFileName: string,
  elements: Record<string, string>,
): Promise<Buffer> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `tmpl_${Date.now()}_${templateFileName}`);
  const outputPath = path.join(tmpDir, `filled_${Date.now()}_${templateFileName}`);
  const dataPath = path.join(tmpDir, `data_${Date.now()}.json`);

  fs.writeFileSync(inputPath, templateBuffer);
  fs.writeFileSync(dataPath, JSON.stringify(elements));

  const script = `
import sys, json, re
import openpyxl

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

wb = openpyxl.load_workbook(template_path)
filled = []

for sheet in wb.sheetnames:
    ws = wb[sheet]
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                original = cell.value
                new_value = original
                for key, value in data.items():
                    placeholder = '{{' + key + '}}'
                    if placeholder in new_value:
                        new_value = new_value.replace(placeholder, str(value) if value else '')
                        filled.append(key)
                if new_value != original:
                    # Păstrează tipul dacă e numeric
                    try:
                        cell.value = float(new_value) if '.' in new_value else int(new_value)
                    except (ValueError, TypeError):
                        cell.value = new_value

wb.save(output_path)
print(json.dumps({"filled_count": len(set(filled)), "filled_keys": list(set(filled))}))
`;

  const scriptPath = path.join(tmpDir, `fill_xlsx_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    execSync(`python3 ${scriptPath} ${inputPath} ${outputPath} ${dataPath}`, {
      encoding: "utf-8",
      timeout: 60000,
    });
    const fs2 = await import("fs");
    return fs2.readFileSync(outputPath);
  } finally {
    [inputPath, outputPath, dataPath, scriptPath].forEach(p => {
      try { require("fs").unlinkSync(p); } catch {}
    });
  }
}

// ═══ GENERARE DOCUMENT (flow principal) ═══
export async function generateDocument(params: GenerateDocParams): Promise<ReadableStream> {
  const { projectId, templateDocumentId, organizationId, userId } = params;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // 1. Verifică template-ul
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se pregătește template-ul..." })}\n\n`));

        const templateDoc = await db.query.documents.findFirst({
          where: eq(documents.id, templateDocumentId),
        });
        if (!templateDoc) throw new Error("Template not found");

        // 2. Verifică elementele
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se verifică elementele..." })}\n\n`));

        const templateEls = await db.query.templateElements.findMany({
          where: eq(templateElements.documentId, templateDocumentId),
        });

        const projectEls = await db.query.projectElements.findMany({
          where: eq(projectElements.projectId, projectId),
          with: { templateElement: true },
        });

        // Construiește map key → value
        const elementsMap: Record<string, string> = {};
        let filledCount = 0;
        let missingCount = 0;
        const missingKeys: string[] = [];

        for (const tmplEl of templateEls) {
          const projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
          if (projEl?.value && projEl.value.trim() !== "") {
            elementsMap[tmplEl.key] = projEl.value;
            filledCount++;
          } else {
            missingCount++;
            missingKeys.push(tmplEl.label);
          }
        }

        // Raportează progresul
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "progress",
          step: "elements_check",
          filled: filledCount,
          missing: missingCount,
          missingKeys: missingKeys.slice(0, 10),
        })}\n\n`));

        // 3. Verifică că avem elemente confirmate
        const unconfirmedCount = projectEls.filter(pe =>
          pe.value && pe.value.trim() !== "" && !pe.confirmed
        ).length;

        if (unconfirmedCount > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "warning",
            message: `${unconfirmedCount} elemente nu sunt confirmate. Documentul va fi generat, dar verifică valorile.`,
          })}\n\n`));
        }

        // 4. Descarcă template-ul
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se descarcă template-ul original..." })}\n\n`));

        const { buffer: templateBuffer, name: templateName } = await getFileBuffer(templateDoc.fileId);

        // 5. Completează template-ul
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se completează documentul..." })}\n\n`));

        let filledBuffer: Buffer;
        if (templateDoc.fileType === "xlsx") {
          filledBuffer = await fillXlsxTemplate(templateBuffer, templateName, elementsMap);
        } else {
          filledBuffer = await fillDocxTemplate(templateBuffer, templateName, elementsMap);
        }

        // 6. Upload document generat
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se salvează documentul..." })}\n\n`));

        const generatedFileName = `${templateDoc.name}_completat_${new Date().toISOString().slice(0, 10)}.${templateDoc.fileType}`;
        const fileId = await uploadFile(
          filledBuffer,
          generatedFileName,
          templateDoc.fileType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          organizationId,
          userId,
        );

        // 7. Salvare în project_documents
        const [projectDoc] = await db.insert(projectDocuments).values({
          projectId,
          templateDocumentId,
          generatedFileId: fileId,
          status: "generated",
          pagesCompleted: templateDoc.pageCount || 0,
          totalPages: templateDoc.pageCount || 0,
        }).returning();

        // 8. Log AI usage (minimal — Neemia nu folosește AI direct, doar python-docx)
        // Dacă în viitor Neemia folosește Claude pentru validare/reformulare, se loghează aici

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "complete",
          documentId: projectDoc.id,
          fileId,
          fileName: generatedFileName,
          filledCount,
          missingCount,
        })}\n\n`));

        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "error",
          message: (error as Error).message,
        })}\n\n`));
        controller.close();
      }
    },
  });
}

// ═══ VALIDARE PRE-GENERARE ═══
export async function validateBeforeGenerate(
  projectId: string,
  templateDocumentId: string,
): Promise<{ canGenerate: boolean; warnings: string[]; errors: string[] }> {
  const templateEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocumentId),
  });

  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
    with: { templateElement: true },
  });

  const warnings: string[] = [];
  const errors: string[] = [];

  // Check elemente validate în template
  const unvalidatedTemplate = templateEls.filter(e => !e.validated);
  if (unvalidatedTemplate.length > 0) {
    warnings.push(`${unvalidatedTemplate.length} elemente din template nu sunt validate`);
  }

  // Check elemente completate
  let missingRequired = 0;
  for (const tmplEl of templateEls) {
    const projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
    if (!projEl?.value || projEl.value.trim() === "") {
      missingRequired++;
    }
  }

  if (missingRequired > 0) {
    warnings.push(`${missingRequired} câmpuri nu sunt completate — vor rămâne goale în document`);
  }

  // Check elemente neconfirmate
  const unconfirmed = projectEls.filter(pe =>
    pe.value && pe.value.trim() !== "" && !pe.confirmed
  );
  if (unconfirmed.length > 0) {
    warnings.push(`${unconfirmed.length} câmpuri completate dar neconfirmate`);
  }

  return {
    canGenerate: errors.length === 0,
    warnings,
    errors,
  };
}
```

---

## 6.2 ROUTES NEEMIA

```typescript
// apps/api/src/routes/neemia.ts
import { Hono } from "hono";
import { db } from "../db";
import { projectDocuments, documents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { generateDocument, validateBeforeGenerate } from "../services/neemia";
import { getFileUrl } from "../services/storage";

export const neemiaRoutes = new Hono();

// Validare pre-generare
neemiaRoutes.post("/projects/:projectId/neemia/validate", async (c) => {
  const projectId = c.req.param("projectId");
  const { templateDocumentId } = await c.req.json();

  const result = await validateBeforeGenerate(projectId, templateDocumentId);
  return c.json(result);
});

// Generare document (SSE streaming)
neemiaRoutes.post("/projects/:projectId/neemia/generate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const { templateDocumentId } = await c.req.json();

  const stream = await generateDocument({
    projectId,
    templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Lista documente generate per proiect
neemiaRoutes.get("/projects/:projectId/neemia/documents", async (c) => {
  const projectId = c.req.param("projectId");

  const docs = await db.query.projectDocuments.findMany({
    where: eq(projectDocuments.projectId, projectId),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });

  // Enrich cu template name și download URL
  const enriched = await Promise.all(docs.map(async (d) => {
    const templateDoc = await db.query.documents.findFirst({
      where: eq(documents.id, d.templateDocumentId),
    });
    const downloadUrl = d.generatedFileId ? await getFileUrl(d.generatedFileId) : null;

    return {
      ...d,
      templateName: templateDoc?.name || "Unknown",
      templateFileType: templateDoc?.fileType || "docx",
      downloadUrl,
    };
  }));

  return c.json(enriched);
});

// Download document generat
neemiaRoutes.get("/neemia/documents/:docId/download", async (c) => {
  const docId = c.req.param("docId");

  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc || !projDoc.generatedFileId) return c.json({ error: "Not found" }, 404);

  const url = await getFileUrl(projDoc.generatedFileId);
  return c.json({ downloadUrl: url });
});

// Validare document de către consultant
neemiaRoutes.put("/neemia/documents/:docId/validate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const [updated] = await db.update(projectDocuments).set({
    status: "validated",
    validatedBy: auth.userId,
  }).where(eq(projectDocuments.id, docId)).returning();

  return c.json(updated);
});

// Regenerare document
neemiaRoutes.post("/neemia/documents/:docId/regenerate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc) return c.json({ error: "Not found" }, 404);

  // Ștergere vechi + regenerare
  const stream = await generateDocument({
    projectId: projDoc.projectId,
    templateDocumentId: projDoc.templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
```

---

## 6.3 FRONTEND: NEEMIA TAB

### Referință UI: `NeemiaView` din `05b_ProjectView.jsx`

### Layout: 3 panouri (din prototip)

```
┌──────────────┬─────────────────────────────┬──────────────┐
│  TEMPLATES   │  DOC PREVIEW                │  FIELDS      │
│  (240px)     │  (flex)                     │  (300px)     │
│              │                             │              │
│  ┌─────────┐ │  ┌─ PAGE NAV ──────────┐   │  Câmpuri     │
│  │ Cerere  │ │  │ [1] [2] [3] [4] [5] │   │  Pag. 1     │
│  │ DOCX    │ │  │          Descarcă ↓  │   │              │
│  │ 7/10    │ │  └──────────────────────┘   │  ┌─────────┐ │
│  │ ████░░  │ │                             │  │Denumire │ │
│  └─────────┘ │  ┌──────────────────────┐   │  │COMEXIM  │ │
│  ┌─────────┐ │  │  DOCUMENT OFICIAL    │   │  │🟢 ONRC  │ │
│  │ Plan    │ │  │                      │   │  └─────────┘ │
│  │ DOCX    │ │  │  Pag. 1: Date ident. │   │  ┌─────────┐ │
│  │ 0/14    │ │  │                      │   │  │CUI      │ │
│  │ ░░░░░░  │ │  │  Denumire: COMEXIM R │   │  │2146135  │ │
│  └─────────┘ │  │  CUI: 2146135       │   │  │🟢 ONRC  │ │
│  ┌─────────┐ │  │  Reg: J20/333/1992  │   │  └─────────┘ │
│  │ Buget   │ │  │  Adresă: ───────────│   │  ┌─────────┐ │
│  │ XLSX    │ │  │                      │   │  │Adresă   │ │
│  │ 0/8     │ │  │  Pag. 1             │   │  │(lipsă)⚠│ │
│  │ ░░░░░░  │ │  └──────────────────────┘   │  │🔴       │ │
│  └─────────┘ │                             │  └─────────┘ │
└──────────────┴─────────────────────────────┴──────────────┘
```

### Panel stânga — Templates (240px, scroll)
- Header: "Template-uri Proiect" (11px uppercase)
- **TemplateCard** per template:
  - Nume + badge format (DOCX/XLSX/PDF albastru mono 10px)
  - Info: "5 pagini · 10 câmpuri"
  - Progress bar (3px): verde (100%) / galben (partial) / roșu (0%)
  - "7/10 câmpuri completate" sub progress
  - Click → selectează template, activează preview centru + fields dreapta

### Panel centru — Doc Preview
- **Page nav bar:** label template name + page thumbs colorate:
  - 🟢 complete (toate câmpurile completate)
  - 🟡 partial (unele completate)
  - 🔴 empty (niciun câmp completat)
  - Active = border albastru + glow
  - Buton "Descarcă ↓" (verde, dreapta)
- **Document mock:** pagină albă (460px × 580px, shadow) cu:
  - Header: "DOCUMENT OFICIAL · GENERARE AUTOMATĂ"
  - Titlu pagină: "Pag. 1: Date identificare"
  - Câmpuri completate: label 10px uppercase + valoare 15px bold cu underline albastru
  - Câmpuri lipsă: label + "(lipsă)" roșu italic cu underline dashed roșu
  - Page number bottom-right
  - Animație pageSlide la schimbare pagină

### Panel dreapta — Fields (300px, scroll)
- Header: "Câmpuri Pag. X" (11px uppercase)
- **FieldCard** per câmp pe pagina curentă:
  - Nume câmp (13px bold)
  - Valoare (albastru) sau "Lipsă ⚠" (roșu italic)
  - Source dot + label: 🔵 "Chat Solomon" / 🟢 "ONRC"

### Flow completare (extend prototipul cu SSE din spec):
1. Selectează template stânga
2. Vede preview cu câmpuri completate/lipsă
3. Click "Generează" → validare pre-generare (warnings: câmpuri neconfirmate, lipsă)
4. Confirmare → **SSE streaming page by page:**
   - Fiecare pagină se completează în timp real
   - Page thumb devine verde pe măsură ce pagina e completată
   - Preview se actualizează live cu pagina curentă
   - "Se pregătește...", "Se completează Pag. 1...", "Pag. 2...", "Complet!"
5. Buton Descarcă devine activ
6. Download → depunere la instituție

### API calls:
```
POST /api/projects/:id/neemia/validate    → verificare pre-generare
POST /api/projects/:id/neemia/generate    → generare SSE streaming
GET  /api/projects/:id/neemia/documents   → lista documente generate
GET  /api/neemia/documents/:id/download   → download URL
PUT  /api/neemia/documents/:id/validate   → marcare "validat"
POST /api/neemia/documents/:id/regenerate → regenerare
```

---


## 6.4 COMPLETARE PDF XFA (Cereri AFIR)

### Context

Cererile de finanțare AFIR sunt **PDF XFA** (Adobe LiveCycle). Analiza documentelor reale:

| Document | Câmpuri | Structură |
|----------|---------|-----------|
| Cererea de Finanțare (Anexa 1) | 1.619 | Câmpuri simple |
| Anexa B (Buget) | 3.185 | Câmpuri simple + **tabele repetitive** (24 rânduri × 16 coloane) |
| Anexa C (Criterii) | 2.465 | Mix simple + repetitive |

**Provocare critică**: Anexa B are **câmpuri repetitive** — aceleași tag-uri (`Categ`, `PretUnit`, `Um`) apar de zeci de ori ca rânduri într-un tabel bugetar. Regex simplu ar completa toate cu aceeași valoare. Trebuie **XML ElementTree cu path indexat**.

### Structura XML datasets (exemplu Anexa B)

```xml
<xfa:datasets>
  <xfa:data>
    <AnexaB>
      <general>                              ← câmpuri simple
        <NumeSolicitant/>
        <CUISolicitant/>
        <TitluProiect/>
      </general>
      <B1>                                   ← secțiune buget
        <VanzariFizicePrevizionate>           ← rândul 0
          <Categ/> <PretUnit/> <Um/>
          <Trim1_An1/> <Trim2_An1/> ...
          <Total_An1/> ... <Total_An5/>
        </VanzariFizicePrevizionate>
        <VanzariFizicePrevizionate>           ← rândul 1
          <Categ/> <PretUnit/> <Um/> ...
        </VanzariFizicePrevizionate>
        ... (24 rânduri)
      </B1>
      <B4> ... </B4>
    </AnexaB>
  </xfa:data>
</xfa:datasets>
```

### Abordare: XML ElementTree cu path indexat

**Key format:**
- Simple: `general.NumeSolicitant`
- Repetitiv: `B1.VanzariFizicePrevizionate[0].Categ` (rândul 0, câmpul Categ)

### Service xfaFiller.ts

```python
# apps/api/src/services/xfa_extract.py
# Script Python apelat din TypeScript via child_process

import fitz, json, sys, re
import xml.etree.ElementTree as ET

def extract_xfa_fields(pdf_path):
    doc = fitz.open(pdf_path)
    xref_len = doc.xref_length()

    # 1. Găsește datasets XML stream (scanare completă)
    datasets_xml = None
    for i in range(1, xref_len):
        try:
            stream = doc.xref_stream(i)
            if stream:
                text = stream.decode('utf-8', errors='ignore')
                if '<xfa:datasets' in text[:200]:
                    datasets_xml = text
                    break
        except:
            pass

    if not datasets_xml:
        doc.close()
        return []

    # 2. Parse XML (strip namespaces)
    clean_xml = re.sub(r'\sxmlns[^"]*"[^"]*"', '', datasets_xml)
    clean_xml = re.sub(r'xfa:', '', clean_xml)
    root = ET.fromstring(clean_xml)

    data_el = root.find('.//data')
    if data_el is None or len(data_el) == 0:
        doc.close()
        return []

    form_root = data_el[0]  # ex: <AnexaB> sau <pdf_121>

    fields = []
    skip_names = {
        'pdfIdentifierCode', 'pdfMajorVersion', 'pdfMinorVersion',
        'pdfBuildNumber', 'pdfVersion', 'textVersion', 'testinternafir'
    }

    def guess_type(name):
        nl = name.lower()
        if any(k in nl for k in ['pret', 'valoare', 'total', 'suma', 'cantitate', 'procent', 'scor']):
            return 'number'
        if any(k in nl for k in ['descriere', 'detaliere', 'observatii']):
            return 'textarea'
        if any(k in nl for k in ['check', 'categ']):
            return 'select'
        if any(k in nl for k in ['semnatura']):
            return 'signature'
        if any(k in nl for k in ['data', 'date']):
            return 'date'
        return 'text'

    def camel_to_label(name):
        result = re.sub(r'([A-Z])', r' \1', name).strip()
        return re.sub(r'_', ' ', result)

    def extract(parent_el, parent_path, group_name):
        children = list(parent_el)
        if not children:
            return

        # Detectează repeating: același tag de mai multe ori
        tag_counts = {}
        for ch in children:
            tag_counts[ch.tag] = tag_counts.get(ch.tag, 0) + 1

        tag_indices = {}

        for ch in children:
            tag = ch.tag
            sub_children = list(ch)
            is_repeating = tag_counts[tag] > 1

            if is_repeating:
                idx = tag_indices.get(tag, 0)
                tag_indices[tag] = idx + 1

                # Câmpuri leaf din grup repetitiv
                for leaf in ch:
                    if len(list(leaf)) == 0:
                        name = leaf.tag
                        if name in skip_names:
                            continue
                        key = f"{parent_path}.{tag}[{idx}].{name}"
                        value = (leaf.text or "").strip()
                        fields.append({
                            "key": key,
                            "label": f"{tag} #{idx+1} — {camel_to_label(name)}",
                            "currentValue": value,
                            "fieldType": guess_type(name),
                            "group": group_name,
                            "isRepeating": True,
                            "rowIndex": idx
                        })

                # Recurse nested
                for nested in ch:
                    if len(list(nested)) > 0:
                        extract(nested, f"{parent_path}.{tag}[{idx}]", group_name)

            elif sub_children:
                # Container non-repetitiv (general, B1, B4...)
                new_group = tag if parent_path == "" else group_name
                new_path = f"{parent_path}.{tag}" if parent_path else tag
                extract(ch, new_path, new_group)

            else:
                # Câmp simplu leaf
                name = tag
                if name in skip_names:
                    continue
                key = f"{parent_path}.{name}" if parent_path else name
                value = (ch.text or "").strip()
                fields.append({
                    "key": key,
                    "label": camel_to_label(name),
                    "currentValue": value,
                    "fieldType": guess_type(name),
                    "group": group_name or "general",
                    "isRepeating": False,
                    "rowIndex": None
                })

    extract(form_root, "", "")
    doc.close()
    return fields


def fill_xfa_pdf(input_path, output_path, data):
    """Completează câmpuri XFA folosind path indexat.
    data = { "general.NumeSolicitant": "SC X SRL", "B1.VanzariFizicePrevizionate[0].Categ": "Grâu" }
    """
    doc = fitz.open(input_path)
    xref_len = doc.xref_length()

    # Găsește datasets stream
    ds_xref = None
    ds_xml = None
    for i in range(1, xref_len):
        try:
            stream = doc.xref_stream(i)
            if stream:
                text = stream.decode('utf-8', errors='ignore')
                if '<xfa:datasets' in text[:200]:
                    ds_xref = i
                    ds_xml = text
                    break
        except:
            pass

    if not ds_xref:
        doc.save(output_path)
        doc.close()
        return {"filled_count": 0, "error": "No datasets stream"}

    # Parse XML
    clean_xml = re.sub(r'\sxmlns[^"]*"[^"]*"', '', ds_xml)
    clean_xml = re.sub(r'xfa:', '', clean_xml)
    root = ET.fromstring(clean_xml)

    data_el = root.find('.//data')
    form_root = data_el[0]

    filled = 0

    def set_by_path(root_el, path_str, value):
        """Navigare XML pe path: 'B1.VanzariFizicePrevizionate[2].Categ'"""
        nonlocal filled
        parts = []
        # Split pe . dar nu pe . din [...]
        for part in re.split(r'\.(?![^\[]*\])', path_str):
            parts.append(part)

        current = root_el
        for part in parts:
            match = re.match(r'^([^\[]+)\[(\d+)\]$', part)
            if match:
                tag_name = match.group(1)
                idx = int(match.group(2))
                matching = [ch for ch in current if ch.tag == tag_name]
                if idx < len(matching):
                    current = matching[idx]
                else:
                    return False
            else:
                child = current.find(part)
                if child is None:
                    return False
                current = child

        safe_value = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        current.text = safe_value
        filled += 1
        return True

    for key_path, value in data.items():
        if not value or not str(value).strip():
            continue
        set_by_path(form_root, key_path, value)

    # Reconstruct XML cu namespace-uri
    output_xml = ET.tostring(root, encoding='unicode')
    output_xml = output_xml.replace(
        '<datasets',
        '<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"',
        1
    )
    output_xml = output_xml.replace('</datasets>', '</xfa:datasets>')

    doc.update_stream(ds_xref, output_xml.encode('utf-8'))
    doc.save(output_path, garbage=0, deflate=False)
    doc.close()
    return {"filled_count": filled}


if __name__ == "__main__":
    import sys
    action = sys.argv[1]
    if action == "extract":
        fields = extract_xfa_fields(sys.argv[2])
        print(json.dumps(fields, ensure_ascii=False))
    elif action == "fill":
        with open(sys.argv[4], 'r', encoding='utf-8') as f:
            data = json.load(f)
        result = fill_xfa_pdf(sys.argv[2], sys.argv[3], data)
        print(json.dumps(result))
```

### TypeScript wrapper

```typescript
// apps/api/src/services/xfaFiller.ts
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const XFA_SCRIPT = path.join(__dirname, "xfa_extract.py");

export interface XFAField {
  key: string;         // "general.NumeSolicitant" sau "B1.VanzariFizicePrevizionate[2].Categ"
  label: string;
  currentValue: string;
  fieldType: string;
  group: string;       // "general", "B1", "B4"
  isRepeating: boolean;
  rowIndex: number | null;
}

export async function extractXFAFields(buffer: Buffer): Promise<XFAField[]> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xfa_${Date.now()}.pdf`);
  fs.writeFileSync(inputPath, buffer);

  try {
    const result = execSync(`python3 ${XFA_SCRIPT} extract ${inputPath}`, {
      encoding: "utf-8",
      timeout: 120000,       // 2 min pentru PDF-uri mari (5000+ xrefs)
      maxBuffer: 20 * 1024 * 1024, // 20MB output
    });
    return JSON.parse(result);
  } finally {
    fs.unlinkSync(inputPath);
  }
}

export async function fillXfaPdf(
  buffer: Buffer,
  elements: Record<string, string>, // path → value
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xfa_in_${Date.now()}.pdf`);
  const outputPath = path.join(tmpDir, `xfa_out_${Date.now()}.pdf`);
  const dataPath = path.join(tmpDir, `xfa_data_${Date.now()}.json`);

  fs.writeFileSync(inputPath, buffer);
  fs.writeFileSync(dataPath, JSON.stringify(elements));

  try {
    const result = execSync(
      `python3 ${XFA_SCRIPT} fill ${inputPath} ${outputPath} ${dataPath}`,
      { encoding: "utf-8", timeout: 60000 }
    );
    const report = JSON.parse(result.trim());
    console.log(`XFA fill: ${report.filled_count} fields filled`);
    return fs.readFileSync(outputPath);
  } finally {
    [inputPath, outputPath, dataPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });
  }
}
```

### Exemplu key-uri complete

```
═══ CEREREA DE FINANȚARE (Anexa 1) — câmpuri simple ═══
general.NumeSolicitant              → "SC CONSTRUCT NORD SRL"
general.TitluProiect                → "Modernizare fabrică CNC"
general.DescriereProiect            → "Proiectul vizează..."
general.ScorAutoevaluare            → "75.50"

═══ ANEXA B (Buget) — câmpuri simple + tabele ═══
general.NumeSolicitant              → "SC CONSTRUCT NORD SRL"  (se propagă automat)
general.CUISolicitant               → "RO12345678"

B1.VanzariFizicePrevizionate[0].Categ       → "Grâu"
B1.VanzariFizicePrevizionate[0].PretUnit    → "850"
B1.VanzariFizicePrevizionate[0].Um          → "tone"
B1.VanzariFizicePrevizionate[0].Trim1_An1   → "50"
B1.VanzariFizicePrevizionate[0].Total_An1   → "200"

B1.VanzariFizicePrevizionate[1].Categ       → "Porumb"
B1.VanzariFizicePrevizionate[1].PretUnit    → "720"
...

═══ ANEXA C (Criterii) ═══
general.NumeSolicitant              → "SC CONSTRUCT NORD SRL"
c1                                  → valoare criteriu 1
p1                                  → punctaj criteriu 1
```

### Implicații pentru Template Viewer (actualizare)

Template Viewer trebuie adaptat pentru câmpuri repetitive:
- **Grupare pe secțiune**: general, B1, B4, etc. (filtre pe group)
- **Câmpuri simple**: afișate ca până acum (card cu key + label + validate)
- **Câmpuri repetitive**: afișate ca **tabel** cu rânduri
  - Header: Categ | PretUnit | Um | Trim1_An1 | ... | Total_An5
  - Rândul 0: [input] [input] [input] ...
  - Rândul 1: [input] [input] [input] ...
  - Consultantul completează rând cu rând
- Buton "Validează rândul" per rând, nu per câmp individual

### Implicații pentru Solomon (actualizare)

System prompt-ul Solomon trebuie să includă structura tabelară:
```
## CÂMPURI TABULARE DE COMPLETAT
Tabel B1 — Vânzări Fizice Previzionate (24 rânduri):
  Coloane: Categ, PretUnit, Um, Trim1_An1...Trim4_An2, Total_An1...Total_An5
  Rânduri completate: 0/24
```

Când consultantul uploadează o ofertă de preț, Solomon extrage automat și completează mai multe rânduri cu path indexat.

### Câmpuri comune între documente

`NumeSolicitant`, `TitluProiect`, `DescriereProiect` apar în toate 3 PDF-urile. La completare:
- Se completează o dată (din ONRC sau Solomon)
- Se propagă automat în toate template-urile proiectului
- Key mapping: `general.NumeSolicitant` din Anexa 1 = `general.NumeSolicitant` din Anexa B = idem Anexa C

### Limitări XFA

- XFA e deprecated de Adobe din 2017, dar AFIR încă îl folosește
- PDF-ul completat se deschide corect doar în **Adobe Acrobat Reader** (nu în browsere)
- Câmpurile calculate (totaluri, procente) se **recalculează automat** la deschidere în Acrobat
- Semnătura digitală necesită Adobe Acrobat (nu programatic)
- Timeout: Anexa B cu 5034 xrefs poate dura ~10-30s la scanare completă — timeout 120s setat

## 6.5 PRINCIPII NEEMIA

**CRITICE — de respectat la implementare:**

1. **NU alterează structura documentului** — python-docx modifică DOAR textul din run-uri unde găsește `{{placeholder}}`
2. **NU generează de la zero** — nu se folosește Claude pentru a scrie conținut; doar completează câmpuri
3. **Păstrează formatarea** — font, size, bold, italic, alignment rămân din template-ul original
4. **Păstrează tabelele** — celulele cu placeholder se completează, restul rămân intacte
5. **Headers/footers** — se procesează și acestea (adesea conțin `{{denumire_firma}}`, `{{cui}}`)
6. **Câmpuri lipsă** — dacă un `{{key}}` nu are valoare, rămâne `{{key}}` în document (sau se golește — configurabil)
7. **Pagină cu pagină** — streaming SSE raportează progresul, consultantul poate opri/corecta

---

## 6.7 CHECKLIST FAZA 6

- [ ] Service Neemia: fillDocxTemplate (python-docx, păstrare formatare)
- [ ] Service Neemia: fillXlsxTemplate (openpyxl)
- [ ] Service Neemia: fillXfaPdf (manipulare XML datasets)
- [ ] Service Neemia: extractXFAFields (extragere câmpuri din PDF XFA)
- [ ] Service Neemia: generateDocument cu SSE streaming (DOCX + XLSX + PDF)
- [ ] Service Neemia: validateBeforeGenerate (warnings/errors)
- [ ] Integrare XFA în processTemplate (Faza 3 — detectare PDF, extragere câmpuri)
- [ ] Route Neemia: validare pre-generare
- [ ] Route Neemia: generare SSE streaming
- [ ] Route Neemia: lista documente generate per proiect
- [ ] Route Neemia: download URL
- [ ] Route Neemia: validare consultant
- [ ] Route Neemia: regenerare
- [ ] Frontend: Neemia tab în ProjectView
- [ ] Frontend: lista template-uri cu progres câmpuri (DOCX + XLSX + PDF)
- [ ] Frontend: streaming generare cu progress
- [ ] Frontend: lista documente generate cu download + validare
- [ ] Testare: completare Cerere Finanțare AFIR (PDF XFA cu ~1600 câmpuri)
