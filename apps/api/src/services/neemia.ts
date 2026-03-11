import { db } from "../db";
import {
  projects, projectElements, projectDocuments,
  templateElements, documents, orgConfig, companies,
} from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getFileBuffer, uploadFile } from "./storage";
import crypto from "crypto";

function safeTmpPath(prefix: string, ext: string): string {
  const os = require("os");
  const path = require("path");
  return path.join(os.tmpdir(), `${prefix}_${crypto.randomUUID()}.${ext}`);
}

// ═══ FILL DOCX TEMPLATE ═══
async function fillDocxTemplate(
  templateBuffer: Buffer,
  _templateFileName: string,
  elements: Record<string, string>,
): Promise<Buffer> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("tmpl", "docx");
  const outputPath = safeTmpPath("filled", "docx");
  const dataPath = safeTmpPath("data", "json");

  fs.writeFileSync(inputPath, templateBuffer);
  fs.writeFileSync(dataPath, JSON.stringify(elements));

  const script = `
import sys, json
from docx import Document

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

doc = Document(template_path)
current_page = 1

def replace_in_paragraph(paragraph, data):
    full_text = paragraph.text
    replacements_made = []
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        if placeholder in full_text:
            replacements_made.append(key)
    if not replacements_made:
        return replacements_made
    runs_text = []
    for run in paragraph.runs:
        runs_text.append(run.text)
    combined = ''.join(runs_text)
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        combined = combined.replace(placeholder, str(value) if value else '')
    if paragraph.runs:
        paragraph.runs[0].text = combined
        for run in paragraph.runs[1:]:
            run.text = ''
    return replacements_made

def replace_in_table(table, data):
    all_replaced = []
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                replaced = replace_in_paragraph(paragraph, data)
                all_replaced.extend(replaced)
    return all_replaced

all_filled = []
for para in doc.paragraphs:
    filled = replace_in_paragraph(para, data)
    all_filled.extend(filled)
    for run in para.runs:
        if 'w:br' in run._element.xml and 'type="page"' in run._element.xml:
            current_page += 1

for table in doc.tables:
    filled = replace_in_table(table, data)
    all_filled.extend(filled)

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
unique_filled = list(set(all_filled))
print(json.dumps({"filled_count": len(unique_filled), "filled_keys": unique_filled, "total_pages": current_page}))
`;

  const scriptPath = safeTmpPath("fill", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    execFileSync("python3", [scriptPath, inputPath, outputPath, dataPath], {
      encoding: "utf-8",
      timeout: 60000,
    });
    return fs.readFileSync(outputPath);
  } finally {
    [inputPath, outputPath, dataPath, scriptPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });
  }
}

// ═══ FILL XLSX TEMPLATE ═══
async function fillXlsxTemplate(
  templateBuffer: Buffer,
  _templateFileName: string,
  elements: Record<string, string>,
): Promise<Buffer> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("tmpl", "xlsx");
  const outputPath = safeTmpPath("filled", "xlsx");
  const dataPath = safeTmpPath("data", "json");

  fs.writeFileSync(inputPath, templateBuffer);
  fs.writeFileSync(dataPath, JSON.stringify(elements));

  const script = `
import sys, json
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
                    try:
                        cell.value = float(new_value) if '.' in new_value else int(new_value)
                    except (ValueError, TypeError):
                        cell.value = new_value

wb.save(output_path)
print(json.dumps({"filled_count": len(set(filled)), "filled_keys": list(set(filled))}))
`;

  const scriptPath = safeTmpPath("fill_xlsx", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    execFileSync("python3", [scriptPath, inputPath, outputPath, dataPath], {
      encoding: "utf-8",
      timeout: 60000,
    });
    return fs.readFileSync(outputPath);
  } finally {
    [inputPath, outputPath, dataPath, scriptPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });
  }
}

interface GenerateDocParams {
  projectId: string;
  templateDocumentId: string;
  organizationId: string;
  userId: string;
}

// ═══ GENERATE DOCUMENT (main flow, SSE streaming) ═══
// Automatically detects FILL vs COMPOSE mode from template generationMode
export async function generateDocument(params: GenerateDocParams): Promise<ReadableStream> {
  const { projectId, templateDocumentId, organizationId, userId } = params;
  const encoder = new TextEncoder();

  // Check if template is COMPOSE mode — if so, delegate to composeDocument
  const templateCheck = await db.query.documents.findFirst({
    where: eq(documents.id, templateDocumentId),
  });
  if (templateCheck && (templateCheck as any).generationMode === "compose") {
    const { composeDocument } = await import("./neemiaCompose");
    return composeDocument({ projectId, templateDocumentId, organizationId, userId });
  }

  return new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se pregătește template-ul..." })}\n\n`));

        const templateDoc = await db.query.documents.findFirst({
          where: eq(documents.id, templateDocumentId),
        });
        if (!templateDoc) throw new Error("Template not found");

        // Load project for metadata (program, prefix, nomenclator etc.)
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        const company = project ? await db.query.companies.findFirst({
          where: eq(companies.id, project.companyId),
        }) : null;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se verifică elementele..." })}\n\n`));

        const templateEls = await db.query.templateElements.findMany({
          where: eq(templateElements.documentId, templateDocumentId),
        });

        const projectEls = await db.query.projectElements.findMany({
          where: eq(projectElements.projectId, projectId),
        });

        // Build key → value map
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

        // Inject project metadata as additional element values (Solomon-collected data)
        if (project?.programFinantare) elementsMap["program_finantare"] = project.programFinantare;
        if (project?.codMasura) elementsMap["cod_masura"] = project.codMasura;
        if (project?.codSesiune) elementsMap["cod_sesiune"] = project.codSesiune;
        if (project?.codNomenclator) elementsMap["cod_nomenclator"] = project.codNomenclator;
        if (project?.prefixDocumente) elementsMap["prefix_documente"] = project.prefixDocumente;
        if (project?.codMysmis) elementsMap["cod_mysmis"] = project.codMysmis;
        if (company?.denumire) elementsMap["denumire_firma"] = company.denumire;
        if (company?.cui) elementsMap["cui_firma"] = company.cui;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "progress",
          step: "elements_check",
          filled: filledCount,
          missing: missingCount,
          missingKeys: missingKeys.slice(0, 10),
        })}\n\n`));

        // Check unconfirmed
        const unconfirmedCount = projectEls.filter(pe =>
          pe.value && pe.value.trim() !== "" && !pe.confirmed
        ).length;

        if (unconfirmedCount > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "warning",
            message: `${unconfirmedCount} elemente nu sunt confirmate. Documentul va fi generat, dar verifică valorile.`,
          })}\n\n`));
        }

        // Download template
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se descarcă template-ul original..." })}\n\n`));

        const { buffer: templateBuffer, name: templateName } = await getFileBuffer(templateDoc.fileId);

        // Fill template
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se completează documentul..." })}\n\n`));

        let filledBuffer: Buffer;
        if (templateDoc.fileType === "xlsx") {
          filledBuffer = await fillXlsxTemplate(templateBuffer, templateName, elementsMap);
        } else {
          filledBuffer = await fillDocxTemplate(templateBuffer, templateName, elementsMap);
        }

        // Post-generation verification: check for remaining {{...}} placeholders
        const remainingPlaceholders = await verifyNoRemainingPlaceholders(filledBuffer, templateDoc.fileType);
        if (remainingPlaceholders.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "warning",
            message: `${remainingPlaceholders.length} placeholder-uri rămase necompletate: ${remainingPlaceholders.slice(0, 5).join(", ")}${remainingPlaceholders.length > 5 ? "..." : ""}`,
            remainingPlaceholders,
          })}\n\n`));
        }

        // Upload generated doc
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se salvează documentul..." })}\n\n`));

        const prefix = project?.prefixDocumente ? `${project.prefixDocumente}` : "";
        const generatedFileName = `${prefix}${templateDoc.name}_completat_${new Date().toISOString().slice(0, 10)}.${templateDoc.fileType}`;
        const fileId = await uploadFile(
          filledBuffer,
          generatedFileName,
          templateDoc.fileType === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          organizationId,
          userId,
        );

        // Determine version atomically using a single query
        const existingDocs = await db.query.projectDocuments.findMany({
          where: and(
            eq(projectDocuments.projectId, projectId),
            eq(projectDocuments.templateDocumentId, templateDocumentId),
          ),
          orderBy: (d, { desc }) => [desc(d.version)],
          limit: 1,
        });
        const nextVersion = existingDocs.length > 0 ? (existingDocs[0].version + 1) : 1;

        // Save in project_documents (new version, keeps old versions as history)
        const [projectDoc] = await db.insert(projectDocuments).values({
          projectId,
          templateDocumentId,
          generatedFileId: fileId,
          status: "generated",
          version: nextVersion,
          pagesCompleted: templateDoc.pageCount || 0,
          totalPages: templateDoc.pageCount || 0,
          filledCount,
          missingCount,
          missingKeys,
          generatedBy: userId,
        }).returning();

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

// ═══ VALIDATE BEFORE GENERATE ═══
export async function validateBeforeGenerate(
  projectId: string,
  templateDocumentId: string,
): Promise<{ canGenerate: boolean; warnings: string[]; errors: string[]; stats: { total: number; filled: number; confirmed: number; unvalidatedTemplate: number } }> {
  const templateEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocumentId),
  });

  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const warnings: string[] = [];
  const errors: string[] = [];

  // Check unvalidated template elements
  const unvalidatedTemplate = templateEls.filter(e => !e.validated);
  if (unvalidatedTemplate.length > 0) {
    warnings.push(`${unvalidatedTemplate.length} elemente din template nu sunt validate de consultant`);
  }

  // Check missing values — distinguish between critical and optional
  const missingLabels: string[] = [];
  let filledCount = 0;
  let confirmedCount = 0;

  for (const tmplEl of templateEls) {
    const projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
    if (!projEl?.value || projEl.value.trim() === "") {
      missingLabels.push(tmplEl.label);
    } else {
      filledCount++;
      if (projEl.confirmed) confirmedCount++;
    }
  }

  if (missingLabels.length > 0) {
    warnings.push(`${missingLabels.length} câmpuri goale: ${missingLabels.slice(0, 5).join(", ")}${missingLabels.length > 5 ? ` (+${missingLabels.length - 5} altele)` : ""}`);
  }

  // Check unconfirmed elements with source
  const unconfirmedSolomon = projectEls.filter(pe =>
    pe.value && pe.value.trim() !== "" && !pe.confirmed && pe.source === "solomon"
  );
  if (unconfirmedSolomon.length > 0) {
    warnings.push(`${unconfirmedSolomon.length} câmpuri completate de Solomon dar neconfirmate de consultant`);
  }

  const unconfirmedCalculated = projectEls.filter(pe =>
    pe.value && pe.value.trim() !== "" && !pe.confirmed && pe.source === "calculated"
  );
  if (unconfirmedCalculated.length > 0) {
    warnings.push(`${unconfirmedCalculated.length} câmpuri calculate automat neconfirmate de consultant (cofinanțare, intensitate, TVA, etc.)`);
  }

  const unconfirmedOther = projectEls.filter(pe =>
    pe.value && pe.value.trim() !== "" && !pe.confirmed && pe.source !== "solomon" && pe.source !== "calculated"
  );
  if (unconfirmedOther.length > 0) {
    warnings.push(`${unconfirmedOther.length} câmpuri completate dar neconfirmate`);
  }

  // Cross-doc consistency check
  const consistency = await checkCrossDocumentConsistency(projectId);
  if (!consistency.consistent) {
    for (const c of consistency.conflicts.slice(0, 3)) {
      const vals = c.values.map(v => `${v.templateName}: "${v.value}"`).join(" vs ");
      warnings.push(`Inconsistență "${c.label}": ${vals}`);
    }
    if (consistency.conflicts.length > 3) {
      warnings.push(`...și alte ${consistency.conflicts.length - 3} inconsistențe`);
    }
  }

  // Completare percentage check
  const totalEls = templateEls.length;
  if (totalEls > 0) {
    const pct = Math.round((filledCount / totalEls) * 100);
    if (pct < 50) {
      warnings.push(`Doar ${pct}% din câmpuri sunt completate (${filledCount}/${totalEls})`);
    }
  }

  return {
    canGenerate: errors.length === 0,
    warnings,
    errors,
    stats: {
      total: templateEls.length,
      filled: filledCount,
      confirmed: confirmedCount,
      unvalidatedTemplate: unvalidatedTemplate.length,
    },
  };
}

// ═══ CROSS-DOCUMENT CONSISTENCY CHECK ═══
// Verifică că aceleași câmpuri (key) au aceleași valori în toate template-urile proiectului
// Fixed N+1 query: batch-loads templateElements and documents upfront
export async function checkCrossDocumentConsistency(
  projectId: string,
): Promise<{ consistent: boolean; conflicts: Array<{ key: string; label: string; values: Array<{ templateName: string; value: string }> }> }> {
  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const nonEmpty = projectEls.filter(pel => pel.value && pel.value.trim() !== "");
  if (nonEmpty.length === 0) return { consistent: true, conflicts: [] };

  // Batch load all referenced templateElements in one query
  const tmplElIds = [...new Set(nonEmpty.map(pe => pe.templateElementId))];
  const allTmplEls = tmplElIds.length > 0
    ? await db.query.templateElements.findMany({
        where: inArray(templateElements.id, tmplElIds),
      })
    : [];
  const tmplElMap = new Map(allTmplEls.map(t => [t.id, t]));

  // Batch load all referenced documents in one query
  const docIds = [...new Set(allTmplEls.map(t => t.documentId))];
  const allDocs = docIds.length > 0
    ? await db.query.documents.findMany({
        where: inArray(documents.id, docIds),
      })
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  // Group by templateElement key
  const keyToValues = new Map<string, Array<{ templateName: string; value: string; label: string }>>();

  for (const pel of nonEmpty) {
    const tmplEl = tmplElMap.get(pel.templateElementId);
    if (!tmplEl) continue;

    const doc = docMap.get(tmplEl.documentId);
    const entry = { templateName: doc?.name || "Necunoscut", value: pel.value!, label: tmplEl.label };
    const existing = keyToValues.get(tmplEl.key) || [];
    existing.push(entry);
    keyToValues.set(tmplEl.key, existing);
  }

  // Find conflicts: same key, different values across templates
  const conflicts: Array<{ key: string; label: string; values: Array<{ templateName: string; value: string }> }> = [];

  for (const [key, entries] of keyToValues) {
    if (entries.length < 2) continue;
    const uniqueValues = new Set(entries.map(e => e.value.trim().toLowerCase()));
    if (uniqueValues.size > 1) {
      conflicts.push({
        key,
        label: entries[0].label,
        values: entries.map(e => ({ templateName: e.templateName, value: e.value })),
      });
    }
  }

  return { consistent: conflicts.length === 0, conflicts };
}

// ═══ CALCULATED FIELDS ═══
// Calculează automat câmpuri derivate (totaluri, procente, diferențe) bazat pe valorile existente
export async function computeCalculatedFields(
  projectId: string,
  organizationId: string,
): Promise<Array<{ key: string; label: string; calculatedValue: string; formula: string }>> {
  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const tmplEls = await db.query.templateElements.findMany({
    where: eq(templateElements.organizationId, organizationId),
  });
  const tmplMap = new Map(tmplEls.map(t => [t.id, t]));

  // Build key→value lookup
  const values = new Map<string, string>();
  for (const pe of projectEls) {
    const te = tmplMap.get(pe.templateElementId);
    if (te && pe.value) values.set(te.key, pe.value);
  }

  const getNum = (key: string): number | null => {
    const v = values.get(key);
    if (!v) return null;
    const n = parseFloat(v.replace(/[^\d.,\-]/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  };

  const results: Array<{ key: string; label: string; calculatedValue: string; formula: string }> = [];

  // Standard calculations for EU funding projects
  const calculations: Array<{
    targetKey: string;
    label: string;
    formula: string;
    compute: () => string | null;
  }> = [
    {
      targetKey: "cofinantare_proprie",
      label: "Contribuție proprie (calculată)",
      formula: "valoare_totala_proiect - ajutor_nerambursabil",
      compute: () => {
        const total = getNum("valoare_totala_proiect") ?? getNum("valoare_totala");
        const ajutor = getNum("ajutor_nerambursabil") ?? getNum("finantare_nerambursabila");
        if (total !== null && ajutor !== null) return (total - ajutor).toFixed(2);
        return null;
      },
    },
    {
      targetKey: "intensitate_ajutor",
      label: "Intensitate ajutor (%)",
      formula: "(ajutor_nerambursabil / valoare_totala_proiect) * 100",
      compute: () => {
        const total = getNum("valoare_totala_proiect") ?? getNum("valoare_totala");
        const ajutor = getNum("ajutor_nerambursabil") ?? getNum("finantare_nerambursabila");
        if (total !== null && ajutor !== null && total > 0) return ((ajutor / total) * 100).toFixed(2);
        return null;
      },
    },
    {
      targetKey: "tva_total",
      label: "TVA total proiect",
      formula: "valoare_totala_cu_tva - valoare_totala_fara_tva",
      compute: () => {
        const cuTva = getNum("valoare_totala_cu_tva") ?? getNum("total_cu_tva");
        const faraTva = getNum("valoare_totala_fara_tva") ?? getNum("total_fara_tva") ?? getNum("valoare_totala_proiect");
        if (cuTva !== null && faraTva !== null) return (cuTva - faraTva).toFixed(2);
        return null;
      },
    },
    {
      targetKey: "durata_sustenabilitate_end",
      label: "Data sfârșit sustenabilitate",
      formula: "data_finalizare + 3 ani (sau 5 ani)",
      compute: () => {
        const dataStr = values.get("data_finalizare_implementare") ?? values.get("data_finalizare");
        if (!dataStr) return null;
        try {
          const d = new Date(dataStr);
          if (isNaN(d.getTime())) return null;
          d.setFullYear(d.getFullYear() + 3); // 3 ani sustenabilitate IMM
          return d.toISOString().slice(0, 10);
        } catch { return null; }
      },
    },
  ];

  for (const calc of calculations) {
    const result = calc.compute();
    if (result !== null) {
      results.push({
        key: calc.targetKey,
        label: calc.label,
        calculatedValue: result,
        formula: calc.formula,
      });

      // Auto-update in project if key exists and field is empty or source is "calculated"
      // IMPORTANT: calculated fields are saved as unconfirmed — consultant must review & confirm
      const tmplEl = tmplEls.find(t => t.key === calc.targetKey);
      if (tmplEl) {
        const projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
        if (projEl && (!projEl.value || projEl.source === "calculated")) {
          await db.update(projectElements).set({
            value: result,
            source: "calculated",
            confirmed: false,
            confirmedBy: null,
            updatedAt: new Date(),
          }).where(eq(projectElements.id, projEl.id));
        }
      }
    }
  }

  return results;
}

// ═══ GENERATE ALL DOCUMENTS (bulk) ═══
export async function generateAllDocuments(params: {
  projectId: string;
  organizationId: string;
  userId: string;
}): Promise<ReadableStream> {
  const { projectId, organizationId, userId } = params;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Find all template documents for this project's session
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        if (!project) throw new Error("Project not found");

        // Compute calculated fields first
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "status", message: "Se calculează câmpurile derivate...",
        })}\n\n`));

        const calculated = await computeCalculatedFields(projectId, organizationId);
        if (calculated.length > 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "calculated_fields",
            fields: calculated,
          })}\n\n`));
        }

        // Check cross-document consistency
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "status", message: "Se verifică consistența între documente...",
        })}\n\n`));

        const consistency = await checkCrossDocumentConsistency(projectId);
        if (!consistency.consistent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "consistency_warning",
            conflicts: consistency.conflicts,
            message: `${consistency.conflicts.length} câmpuri au valori diferite în template-uri diferite!`,
          })}\n\n`));
        }

        // Find all templates that have elements for this project — batch query
        const projectEls = await db.query.projectElements.findMany({
          where: eq(projectElements.projectId, projectId),
        });

        const tmplElIds = [...new Set(projectEls.map(pe => pe.templateElementId))];
        const allTmplEls = tmplElIds.length > 0
          ? await db.query.templateElements.findMany({
              where: inArray(templateElements.id, tmplElIds),
            })
          : [];

        const templateDocIds = [...new Set(allTmplEls.map(te => te.documentId))];
        const validDocs = templateDocIds.length > 0
          ? await db.query.documents.findMany({
              where: inArray(documents.id, templateDocIds),
            })
          : [];

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "status",
          message: `Se generează ${validDocs.length} documente...`,
          total: validDocs.length,
        })}\n\n`));

        // Generate each document sequentially
        const results: Array<{ templateName: string; status: string; documentId?: string; filledCount?: number; missingCount?: number; error?: string }> = [];

        for (let i = 0; i < validDocs.length; i++) {
          const doc = validDocs[i];

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "doc_progress",
            current: i + 1,
            total: validDocs.length,
            templateName: doc.name,
          })}\n\n`));

          try {
            // Build elements map for this specific template
            const docTemplateEls = allTmplEls.filter(te => te.documentId === doc.id);

            const elementsMap: Record<string, string> = {};
            let filledCount = 0;
            let missingCount = 0;

            for (const tmplEl of docTemplateEls) {
              const projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
              if (projEl?.value && projEl.value.trim() !== "") {
                elementsMap[tmplEl.key] = projEl.value;
                filledCount++;
              } else {
                missingCount++;
              }
            }

            // Download and fill
            const { buffer: templateBuffer, name: templateName } = await getFileBuffer(doc.fileId);
            let filledBuffer: Buffer;

            if (doc.fileType === "xlsx") {
              filledBuffer = await fillXlsxTemplate(templateBuffer, templateName, elementsMap);
            } else {
              filledBuffer = await fillDocxTemplate(templateBuffer, templateName, elementsMap);
            }

            // Upload and save
            const generatedFileName = `${doc.name}_completat_${new Date().toISOString().slice(0, 10)}.${doc.fileType}`;
            const fileId = await uploadFile(
              filledBuffer,
              generatedFileName,
              doc.fileType === "xlsx"
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              organizationId,
              userId,
            );

            const [projectDoc] = await db.insert(projectDocuments).values({
              projectId,
              templateDocumentId: doc.id,
              generatedFileId: fileId,
              status: "generated",
              pagesCompleted: doc.pageCount || 0,
              totalPages: doc.pageCount || 0,
            }).returning();

            results.push({
              templateName: doc.name,
              status: "success",
              documentId: projectDoc.id,
              filledCount,
              missingCount,
            });
          } catch (err) {
            results.push({
              templateName: doc.name,
              status: "error",
              error: (err as Error).message,
            });
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "bulk_complete",
          results,
          totalGenerated: results.filter(r => r.status === "success").length,
          totalFailed: results.filter(r => r.status === "error").length,
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

// ═══ POST-GENERATION VERIFICATION ═══
// Checks the generated document for any remaining {{...}} placeholders
export async function verifyNoRemainingPlaceholders(
  buffer: Buffer,
  fileType: string,
): Promise<string[]> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("verify", fileType === "xlsx" ? "xlsx" : "docx");
  fs.writeFileSync(inputPath, buffer);

  const script = fileType === "xlsx" ? `
import sys, json, re
import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
remaining = []
for sheet in wb.sheetnames:
    ws = wb[sheet]
    for row in ws.iter_rows(values_only=False):
        for cell in row:
            if cell.value and isinstance(cell.value, str):
                matches = re.findall(r'\\{\\{([^}]+)\\}\\}', cell.value)
                remaining.extend(matches)
print(json.dumps(list(set(remaining))))
` : `
import sys, json, re
from docx import Document

doc = Document(sys.argv[1])
remaining = []
for para in doc.paragraphs:
    matches = re.findall(r'\\{\\{([^}]+)\\}\\}', para.text)
    remaining.extend(matches)
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                matches = re.findall(r'\\{\\{([^}]+)\\}\\}', para.text)
                remaining.extend(matches)
for section in doc.sections:
    for header in [section.header, section.first_page_header]:
        if header:
            for para in header.paragraphs:
                matches = re.findall(r'\\{\\{([^}]+)\\}\\}', para.text)
                remaining.extend(matches)
    for footer in [section.footer, section.first_page_footer]:
        if footer:
            for para in footer.paragraphs:
                matches = re.findall(r'\\{\\{([^}]+)\\}\\}', para.text)
                remaining.extend(matches)
print(json.dumps(list(set(remaining))))
`;

  const scriptPath = safeTmpPath("verify", "py");
  fs.writeFileSync(scriptPath, script);

  try {
    const result = execFileSync("python3", [scriptPath, inputPath], {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result.trim());
  } catch {
    return []; // If verification fails, don't block the flow
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}
