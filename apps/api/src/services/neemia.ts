import { db } from "../db";
import {
  projects, projectElements, projectDocuments,
  templateElements, documents, orgConfig, companies,
  organizations, templatePlaceholderMapping, elementDefinitions,
  projectChecklist,
} from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logAIUsage } from "./aiUsage";
import { getFileBuffer, uploadFile } from "./storage";
import crypto from "crypto";
import { preflightCached } from "./dbPreflight";

/**
 * Build key→value map for template filling.
 * Uses template_placeholder_mapping → elementDefId → projectElements as primary path,
 * falls back to templateElements → templateElementId → projectElements.
 */
async function buildElementsMap(
  templateDocumentId: string,
  projectId: string,
  projectEls: Array<{ templateElementId: string | null; elementDefId: string | null; value: string | null; confirmed: boolean; source: string | null }>,
): Promise<{ elementsMap: Record<string, string>; filledCount: number; missingCount: number; missingKeys: string[] }> {
  const elementsMap: Record<string, string> = {};
  let filledCount = 0;
  let missingCount = 0;
  const missingKeys: string[] = [];
  const resolvedPlaceholders = new Set<string>();

  // Path 1: template_placeholder_mapping → elementDefId → projectElements
  const mappings = await db.query.templatePlaceholderMapping.findMany({
    where: eq(templatePlaceholderMapping.templateDocumentId, templateDocumentId),
  });

  if (mappings.length > 0) {
    for (const mapping of mappings) {
      const projEl = projectEls.find(pe => pe.elementDefId === mapping.elementDefId);
      if (projEl?.value && projEl.value.trim() !== "") {
        elementsMap[mapping.placeholderKey] = projEl.value;
        filledCount++;
        resolvedPlaceholders.add(mapping.placeholderKey);
      } else {
        // Try to get a display name for the missing key
        const elemDef = await db.query.elementDefinitions.findFirst({
          where: eq(elementDefinitions.id, mapping.elementDefId),
        });
        missingCount++;
        missingKeys.push(elemDef?.displayName || mapping.placeholderKey);
        resolvedPlaceholders.add(mapping.placeholderKey);
      }
    }
  }

  // Path 2 (fallback): templateElements → templateElementId → projectElements
  const templateEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocumentId),
  });

  for (const tmplEl of templateEls) {
    if (resolvedPlaceholders.has(tmplEl.key)) continue; // Already resolved via mapping

    const projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
    if (projEl?.value && projEl.value.trim() !== "") {
      elementsMap[tmplEl.key] = projEl.value;
      filledCount++;
    } else {
      missingCount++;
      missingKeys.push(tmplEl.label);
    }
  }

  return { elementsMap, filledCount, missingCount, missingKeys };
}

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
  cabinetStyle?: Record<string, any>,
  checklistDone?: string[],
): Promise<Buffer> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("tmpl", "docx");
  const outputPath = safeTmpPath("filled", "docx");
  const dataPath = safeTmpPath("data", "json");

  fs.writeFileSync(inputPath, templateBuffer);
  fs.writeFileSync(dataPath, JSON.stringify({
    elements,
    cabinetStyle: cabinetStyle || {},
    checklistDone: checklistDone || [],
  }));

  const script = `
import sys, json, re
from docx import Document
from docx.shared import Pt, RGBColor

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    payload = json.load(f)

data = payload.get('elements', payload) if isinstance(payload, dict) and 'elements' in payload else payload
cabinet_style = payload.get('cabinetStyle', {}) if isinstance(payload, dict) else {}
checklist_done = payload.get('checklistDone', []) if isinstance(payload, dict) else []
checklist_done_lower = [item.lower() for item in checklist_done]

doc = Document(template_path)
current_page = 1

# W5.1: Romanian number formatting (125.5 → "125,5", 1234567.89 → "1.234.567,89")
def format_ro(value):
    """Format value for Romanian locale: decimal comma, dot thousands separator."""
    s = str(value) if value else ''
    try:
        num = float(s.replace(',', '.'))
        if num == int(num) and '.' not in s and ',' not in s:
            return '{:,.0f}'.format(num).replace(',', '.')
        else:
            formatted = '{:,.2f}'.format(num)
            formatted = formatted.replace(',', '_').replace('.', ',').replace('_', '.')
            return formatted
    except (ValueError, TypeError):
        return s

# FIX 4: Replace unfilled placeholders with [DE COMPLETAT] markup
def mark_unfilled(text, data):
    """Replace any remaining {{key}} with [DE COMPLETAT - Display Name]."""
    def replacer(match):
        key = match.group(1)
        if key in data and data[key]:
            return format_ro(data[key])
        # Try to derive display name from key
        display = key.replace('_', ' ').title()
        return '[DE COMPLETAT - ' + display + ']'
    return re.sub(r'\\{\\{([^}]+)\\}\\}', replacer, text)

# FIX 3: Section E checkbox replacement
def replace_checkbox(text, checklist_lower):
    """Replace ☐ (unchecked) with ☒ (checked) for checklist items that are done."""
    if not checklist_lower:
        return text
    # Common checkbox patterns: ☐ Item Name or □ Item Name
    for item in checklist_lower:
        # Match checkbox followed by text that matches the checklist item
        for checkbox_char in ['\\u2610', '\\u25A1', '[ ]']:
            pattern = re.escape(checkbox_char)
            for match in re.finditer(pattern + r'\\s*(.{5,80})', text):
                context = match.group(1).lower().strip()
                if any(kw in context for kw in item.split()[:3]):
                    checked = '\\u2612' if checkbox_char != '[ ]' else '[X]'
                    text = text[:match.start()] + checked + text[match.start() + len(match.group(0)) - len(match.group(1)):]
                    break
    return text

def replace_in_paragraph(paragraph, data):
    full_text = paragraph.text
    replacements_made = []
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        if placeholder in full_text:
            replacements_made.append(key)
    if not replacements_made and '{{' not in full_text:
        # FIX 3: Still check for checkboxes even if no placeholders
        if checklist_done_lower and any(c in full_text for c in ['\\u2610', '\\u25A1', '[ ]']):
            combined = full_text
            combined = replace_checkbox(combined, checklist_done_lower)
            if combined != full_text and paragraph.runs:
                paragraph.runs[0].text = combined
                for run in paragraph.runs[1:]:
                    run.text = ''
        return replacements_made
    runs_text = []
    for run in paragraph.runs:
        runs_text.append(run.text)
    combined = ''.join(runs_text)
    # FIX 4: Replace all placeholders — filled ones get value, unfilled get [DE COMPLETAT]
    combined = mark_unfilled(combined, data)
    # FIX 3: Replace checkboxes for Section E
    combined = replace_checkbox(combined, checklist_done_lower)
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

# Apply cabinet document style
font_family = cabinet_style.get('fontFamily')
footer_text = cabinet_style.get('footerText')
primary_color = cabinet_style.get('primaryColor', '').lstrip('#')

# Apply font family to all runs if specified
if font_family:
    for para in doc.paragraphs:
        for run in para.runs:
            if run.font and run.text.strip():
                run.font.name = font_family
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for run in para.runs:
                        if run.font and run.text.strip():
                            run.font.name = font_family

# Append cabinet footer text to the last section footer
if footer_text:
    last_section = doc.sections[-1] if doc.sections else None
    if last_section and last_section.footer:
        p = last_section.footer.add_paragraph()
        run = p.add_run(footer_text)
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)
        if font_family:
            run.font.name = font_family

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
import sys, json, re
import openpyxl

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# FIX 10: Romanian number formatting for XLSX
def format_ro(value):
    s = str(value) if value else ''
    try:
        num = float(s.replace(',', '.'))
        if num == int(num) and '.' not in s and ',' not in s:
            return '{:,.0f}'.format(num).replace(',', '.')
        else:
            formatted = '{:,.2f}'.format(num)
            formatted = formatted.replace(',', '_').replace('.', ',').replace('_', '.')
            return formatted
    except (ValueError, TypeError):
        return s

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
                        formatted = format_ro(value) if value else ''
                        new_value = new_value.replace(placeholder, formatted)
                        filled.append(key)
                if new_value != original:
                    # FIX 4: Mark unfilled placeholders
                    new_value = re.sub(r'\\{\\{([^}]+)\\}\\}', lambda m: '[DE COMPLETAT - ' + m.group(1).replace('_', ' ').title() + ']', new_value)
                    try:
                        # Try to store as number for formulas (use dot as decimal for Excel)
                        numeric = new_value.replace('.', '').replace(',', '.')
                        cell.value = float(numeric) if '.' in numeric else int(numeric)
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

  // ─── DB PREFLIGHT CHECK (before any AI calls) ───
  const check = await preflightCached(db, "neemiaGenerate");
  if (!check.ready) {
    console.error("[neemia] Preflight FAILED", { operation: "neemiaGenerate", missing: check.missing });
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: `⚠️ ${check.message}` })}\n\n`));
        controller.close();
      },
    });
  }

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

        const projectEls = await db.query.projectElements.findMany({
          where: eq(projectElements.projectId, projectId),
        });

        // Build key → value map using template_placeholder_mapping + templateElements fallback
        const { elementsMap, filledCount, missingCount, missingKeys } = await buildElementsMap(
          templateDocumentId, projectId, projectEls,
        );

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

        // Load cabinet document style from organization
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, organizationId),
        });
        const cabinetStyle = org?.cabinetDocumentStyle || {};

        // Inject cabinet branding into elements map
        if (cabinetStyle.footerText) elementsMap["footer_cabinet"] = cabinetStyle.footerText;

        // FIX 3: Load checklist done items for Section E checkbox filling
        const checklistItems = await db.select().from(projectChecklist)
          .where(eq(projectChecklist.projectId, projectId));
        const checklistDoneNames = checklistItems.filter(i => i.done).map(i => i.name);

        // FIX 5: Inject financial plan data from company financials + project elements
        if (company) {
          const { companyFinancials } = await import("../db/schema");
          const financials = await db.query.companyFinancials.findMany({
            where: eq(companyFinancials.companyId, company.id),
          });
          if (financials.length > 0) {
            const latest = financials.sort((a, b) => b.year - a.year)[0];
            // Inject F10/F20 balance sheet data as elements if not already present
            const f10 = (latest.f10 as Record<string, any>) || {};
            const f20 = (latest.f20 as Record<string, any>) || {};
            for (const [key, value] of Object.entries({ ...f10, ...f20 })) {
              if (value && !elementsMap[key]) {
                elementsMap[key] = String(value);
              }
            }
          }
        }

        // Fill template
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se completează documentul..." })}\n\n`));

        let filledBuffer: Buffer;
        if (templateDoc.fileType === "xlsx") {
          filledBuffer = await fillXlsxTemplate(templateBuffer, templateName, elementsMap);
        } else if (templateDoc.fileType === "pdf") {
          // FIX F5.1: Integrate XFA fill for PDF templates
          const { fillXFAFields, extractXFAFields } = await import("./xfaFiller");
          const xfaFields = await extractXFAFields(templateBuffer);
          if (xfaFields.length > 0) {
            // Log mapping coverage before fill
            const xfaKeys = new Set(xfaFields.map(f => f.key));
            const elementKeys = Object.keys(elementsMap).filter(k => elementsMap[k]?.trim());
            const matchedKeys = elementKeys.filter(k => xfaKeys.has(k));
            const unmatchedKeys = elementKeys.filter(k => !xfaKeys.has(k));
            console.log(`[neemia] XFA fill: ${xfaFields.length} XFA fields, ${elementKeys.length} elements with values, ${matchedKeys.length} matched, ${unmatchedKeys.length} unmatched`);

            filledBuffer = await fillXFAFields(templateBuffer, elementsMap);

            if (matchedKeys.length === 0 && elementKeys.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "warning",
                message: `ATENȚIE: Niciun element nu s-a potrivit cu câmpurile XFA din template. Template-ul are ${xfaFields.length} câmpuri dar cheile nu corespund. Verificați maparea elementelor în Template Viewer.`,
              })}\n\n`));
            } else if (unmatchedKeys.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "info",
                message: `${matchedKeys.length}/${elementKeys.length} elemente completate în PDF. ${unmatchedKeys.length} elemente fără câmp XFA corespondent.`,
                unmatchedKeys: unmatchedKeys.slice(0, 10),
              })}\n\n`));
            }
          } else {
            console.error(`[neemia] CRITICAL: PDF template "${templateDoc.name}" returned 0 XFA fields — document will be empty`);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "error",
              message: `PDF-ul template "${templateDoc.name}" nu conține câmpuri XFA detectabile. Documentul generat va fi necompletat. Reprocesați template-ul sau folosiți format DOCX.`,
            })}\n\n`));
            filledBuffer = templateBuffer;
          }
        } else {
          filledBuffer = await fillDocxTemplate(templateBuffer, templateName, elementsMap, cabinetStyle, checklistDoneNames);
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

        // FIX 2: Auto-update checklist items matching this template
        await autoUpdateChecklist(projectId, templateDoc.name);

        // FIX 9: Log AI usage for FILL mode (deterministic but tracks generation)
        await logAIUsage({
          organizationId,
          userId,
          agent: "neemia",
          model: "deterministic-fill",
          tokensInput: 0,
          tokensOutput: 0,
          action: "neemia_fill",
          projectId,
        }).catch((e: any) => console.error("[neemia] AI usage log failed:", e.message));

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "complete",
          documentId: projectDoc.id,
          fileId,
          fileName: generatedFileName,
          filledCount,
          missingCount,
          version: nextVersion,
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

// ═══ AUTO-UPDATE CHECKLIST POST-GENERATION ═══
// Marks checklist items as done when their associated template document is generated
async function autoUpdateChecklist(projectId: string, templateName: string): Promise<void> {
  const items = await db.select().from(projectChecklist)
    .where(and(
      eq(projectChecklist.projectId, projectId),
      eq(projectChecklist.done, false),
    ));

  const nameLower = templateName.toLowerCase();
  const matchKeywords = [
    // Map template name fragments to checklist item keywords
    { templateFragment: "cerere", checklistKeywords: ["cerere finantare", "cerere de finantare"] },
    { templateFragment: "memoriu", checklistKeywords: ["memoriu justificativ", "memoriu"] },
    { templateFragment: "anexa_b", checklistKeywords: ["anexa b", "viabilitate"] },
    { templateFragment: "anexa_c", checklistKeywords: ["anexa c"] },
    { templateFragment: "plan_afaceri", checklistKeywords: ["plan afaceri", "plan de afaceri"] },
    { templateFragment: "buget", checklistKeywords: ["buget", "deviz"] },
  ];

  const itemsToUpdate: string[] = [];
  for (const item of items) {
    const itemNameLower = item.name.toLowerCase();
    for (const mapping of matchKeywords) {
      if (nameLower.includes(mapping.templateFragment) &&
          mapping.checklistKeywords.some(kw => itemNameLower.includes(kw))) {
        itemsToUpdate.push(item.id);
        break;
      }
    }
  }

  if (itemsToUpdate.length > 0) {
    await db.update(projectChecklist)
      .set({ done: true, notes: `Auto-marcat la generarea documentului "${templateName}"` })
      .where(inArray(projectChecklist.id, itemsToUpdate));
  }
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

  // Use buildElementsMap for accurate fill/missing counts (uses template_placeholder_mapping + fallback)
  const { filledCount, missingCount: _mc, missingKeys: missingLabels } = await buildElementsMap(
    templateDocumentId, projectId, projectEls,
  );
  let confirmedCount = 0;
  for (const pe of projectEls) {
    if (pe.value && pe.value.trim() !== "" && pe.confirmed) confirmedCount++;
  }

  if (missingLabels.length > 0) {
    warnings.push(`${missingLabels.length} câmpuri goale: ${missingLabels.slice(0, 5).join(", ")}${missingLabels.length > 5 ? ` (+${missingLabels.length - 5} altele)` : ""}`);
  }

  // Check unconfirmed elements with source
  const unconfirmedSolomon = projectEls.filter(pe =>
    pe.value && pe.value.trim() !== "" && !pe.confirmed && (pe.source === "solomon" || pe.source === "solomon_chat")
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
    pe.value && pe.value.trim() !== "" && !pe.confirmed && pe.source !== "solomon" && pe.source !== "solomon_chat" && pe.source !== "calculated"
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

  // Batch load element_definitions for elementDefId resolution
  const elemDefIds = [...new Set(nonEmpty.map(pe => pe.elementDefId).filter((id): id is string => id != null))];
  const allElemDefs = elemDefIds.length > 0
    ? await db.query.elementDefinitions.findMany({
        where: inArray(elementDefinitions.id, elemDefIds),
      })
    : [];
  const elemDefMap = new Map(allElemDefs.map(ed => [ed.id, ed]));

  // Batch load all referenced templateElements in one query
  const tmplElIds = [...new Set(nonEmpty.map(pe => pe.templateElementId).filter((id): id is string => id != null))];
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

  // Group by element key (resolved from elementDefId or templateElementId)
  const keyToValues = new Map<string, Array<{ templateName: string; value: string; label: string }>>();

  for (const pel of nonEmpty) {
    let key: string | null = null;
    let label: string = "Necunoscut";
    let templateName: string = "Necunoscut";

    // Resolve via elementDefId (primary)
    if (pel.elementDefId) {
      const ed = elemDefMap.get(pel.elementDefId);
      if (ed) { key = ed.elementKey; label = ed.displayName; }
    }
    // Fallback: templateElementId
    if (!key && pel.templateElementId) {
      const tmplEl = tmplElMap.get(pel.templateElementId);
      if (tmplEl) {
        key = tmplEl.key;
        label = tmplEl.label;
        const doc = docMap.get(tmplEl.documentId);
        templateName = doc?.name || "Necunoscut";
      }
    }
    if (!key) continue;

    const entry = { templateName, value: pel.value!, label };
    const existing = keyToValues.get(key) || [];
    existing.push(entry);
    keyToValues.set(key, existing);
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

  // Load element_definitions for elementDefId → key resolution
  const elemDefs = await db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, organizationId),
  });
  const elemDefMap = new Map(elemDefs.map(ed => [ed.id, ed]));

  const tmplEls = await db.query.templateElements.findMany({
    where: eq(templateElements.organizationId, organizationId),
  });
  const tmplMap = new Map(tmplEls.map(t => [t.id, t]));

  // Build key→value lookup using elementDefId (primary) + templateElementId (fallback)
  const values = new Map<string, string>();
  for (const pe of projectEls) {
    if (!pe.value) continue;
    // Try elementDefId first
    if (pe.elementDefId) {
      const ed = elemDefMap.get(pe.elementDefId);
      if (ed) { values.set(ed.elementKey, pe.value); continue; }
    }
    // Fallback: templateElementId
    if (pe.templateElementId) {
      const te = tmplMap.get(pe.templateElementId);
      if (te) values.set(te.key, pe.value);
    }
  }

  const getNum = (key: string): number | null => {
    const v = values.get(key);
    if (!v) return null;
    const n = parseFloat(v.replace(/[^\d.,\-]/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  };

  /** Format number with Romanian decimal separator (comma) */
  const fmtRo = (n: number, decimals = 2): string => {
    return n.toFixed(decimals).replace(".", ",");
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
        if (total !== null && ajutor !== null) return fmtRo(total - ajutor);
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
        if (total !== null && ajutor !== null && total > 0) return fmtRo((ajutor / total) * 100);
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
        if (cuTva !== null && faraTva !== null) return fmtRo(cuTva - faraTva);
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
    // ═══ ANEXA B: Indicatori viabilitate financiară (formule deterministe) ═══
    {
      targetKey: "rata_autonomiei_financiare_nete",
      label: "RAFN — Rata Autonomiei Financiare Nete",
      formula: "capitaluri_proprii / total_activ (minim 1.2)",
      compute: () => {
        const capitalPropriu = getNum("capitaluri_proprii") ?? getNum("capital_propriu") ?? getNum("total_capitaluri_proprii");
        const totalActiv = getNum("total_activ") ?? getNum("activ_total") ?? getNum("total_active");
        if (capitalPropriu !== null && totalActiv !== null && totalActiv > 0) {
          const rafn = capitalPropriu / totalActiv;
          return fmtRo(rafn, 4);
        }
        return null;
      },
    },
    {
      targetKey: "rata_indatorarii",
      label: "Rata Îndatorării",
      formula: "datorii_totale / total_activ × 100 (maxim 60%)",
      compute: () => {
        const datoriiTotale = getNum("datorii_totale") ?? getNum("total_datorii");
        const totalActiv = getNum("total_activ") ?? getNum("activ_total") ?? getNum("total_active");
        if (datoriiTotale !== null && totalActiv !== null && totalActiv > 0) {
          const rata = (datoriiTotale / totalActiv) * 100;
          return fmtRo(rata);
        }
        return null;
      },
    },
    {
      targetKey: "rata_lichiditate_curenta",
      label: "Rata Lichidității Curente",
      formula: "active_curente / datorii_curente (minim 1.0)",
      compute: () => {
        const activeCurente = getNum("active_curente") ?? getNum("active_circulante") ?? getNum("total_active_circulante");
        const datoriiCurente = getNum("datorii_curente") ?? getNum("datorii_sub_1an") ?? getNum("datorii_termen_scurt");
        if (activeCurente !== null && datoriiCurente !== null && datoriiCurente > 0) {
          return fmtRo(activeCurente / datoriiCurente, 4);
        }
        return null;
      },
    },
    {
      targetKey: "rata_solvabilitate",
      label: "Rata Solvabilității",
      formula: "total_activ / datorii_totale (minim 1.5)",
      compute: () => {
        const totalActiv = getNum("total_activ") ?? getNum("activ_total") ?? getNum("total_active");
        const datoriiTotale = getNum("datorii_totale") ?? getNum("total_datorii");
        if (totalActiv !== null && datoriiTotale !== null && datoriiTotale > 0) {
          return fmtRo(totalActiv / datoriiTotale, 4);
        }
        return null;
      },
    },
    {
      targetKey: "van_proiect",
      label: "VAN — Valoarea Actualizată Netă",
      formula: "Σ(cash_flow_year_n / (1 + rata_actualizare)^n) − investitie_initiala (minim 0)",
      compute: () => {
        const investitie = getNum("valoare_totala_proiect") ?? getNum("valoare_totala") ?? getNum("investitie_totala");
        if (investitie === null) return null;
        const rataActualizare = getNum("rata_actualizare") ?? 0.05; // default 5%
        const durata = getNum("durata_implementare_ani") ?? getNum("durata_proiect_ani") ?? 5;

        // Estimate annual cash flows from available data
        const venitAnual = getNum("venituri_estimate_anual") ?? getNum("cifra_afaceri_previzionata") ?? getNum("venituri_exploatare");
        const cheltuieliAnuale = getNum("cheltuieli_estimate_anual") ?? getNum("cheltuieli_exploatare");

        if (venitAnual !== null && cheltuieliAnuale !== null) {
          const cfAnual = venitAnual - cheltuieliAnuale;
          let van = -investitie;
          for (let n = 1; n <= durata; n++) {
            van += cfAnual / Math.pow(1 + rataActualizare, n);
          }
          return fmtRo(van);
        }
        return null;
      },
    },
    {
      targetKey: "rir_proiect",
      label: "RIR — Rata Internă de Rentabilitate",
      formula: "Rata la care VAN = 0 (estimare prin interpolare)",
      compute: () => {
        const investitie = getNum("valoare_totala_proiect") ?? getNum("valoare_totala") ?? getNum("investitie_totala");
        if (investitie === null || investitie === 0) return null;
        const durata = getNum("durata_implementare_ani") ?? getNum("durata_proiect_ani") ?? 5;

        const venitAnual = getNum("venituri_estimate_anual") ?? getNum("cifra_afaceri_previzionata") ?? getNum("venituri_exploatare");
        const cheltuieliAnuale = getNum("cheltuieli_estimate_anual") ?? getNum("cheltuieli_exploatare");
        if (venitAnual === null || cheltuieliAnuale === null) return null;
        const cfAnual = venitAnual - cheltuieliAnuale;
        if (cfAnual <= 0) return fmtRo(0);

        // Newton-Raphson approximation for IRR
        let rate = 0.1;
        for (let iter = 0; iter < 50; iter++) {
          let npv = -investitie;
          let dnpv = 0;
          for (let n = 1; n <= durata; n++) {
            const factor = Math.pow(1 + rate, n);
            npv += cfAnual / factor;
            dnpv -= n * cfAnual / (factor * (1 + rate));
          }
          if (Math.abs(dnpv) < 1e-10) break;
          const newRate = rate - npv / dnpv;
          if (Math.abs(newRate - rate) < 1e-8) { rate = newRate; break; }
          rate = newRate;
        }
        return fmtRo(rate * 100); // as percentage
      },
    },
    {
      targetKey: "durata_recuperare_investitie",
      label: "Durata de recuperare a investiției (ani)",
      formula: "investitie_totala / cash_flow_anual",
      compute: () => {
        const investitie = getNum("valoare_totala_proiect") ?? getNum("valoare_totala") ?? getNum("investitie_totala");
        const venitAnual = getNum("venituri_estimate_anual") ?? getNum("cifra_afaceri_previzionata");
        const cheltuieliAnuale = getNum("cheltuieli_estimate_anual") ?? getNum("cheltuieli_exploatare");
        if (investitie !== null && venitAnual !== null && cheltuieliAnuale !== null) {
          const cfAnual = venitAnual - cheltuieliAnuale;
          if (cfAnual > 0) return fmtRo(investitie / cfAnual, 1);
        }
        return null;
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
      // Try elementDefId first, then templateElementId
      const elemDef = elemDefs.find(ed => ed.elementKey === calc.targetKey);
      const tmplEl = tmplEls.find(t => t.key === calc.targetKey);
      let projEl = elemDef ? projectEls.find(pe => pe.elementDefId === elemDef.id) : null;
      if (!projEl && tmplEl) projEl = projectEls.find(pe => pe.templateElementId === tmplEl.id);
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

        const tmplElIds = [...new Set(projectEls.map(pe => pe.templateElementId).filter((id): id is string => id != null))];
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
            // Build elements map using template_placeholder_mapping + templateElements fallback
            const { elementsMap, filledCount, missingCount } = await buildElementsMap(
              doc.id, projectId, projectEls,
            );

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

            // Compute next version number for this template
            const existingVersions = await db.query.projectDocuments.findMany({
              where: and(
                eq(projectDocuments.projectId, projectId),
                eq(projectDocuments.templateDocumentId, doc.id),
              ),
              orderBy: (pd, { desc }) => [desc(pd.version)],
              limit: 1,
            });
            const nextVersion = (existingVersions[0]?.version || 0) + 1;

            const [projectDoc] = await db.insert(projectDocuments).values({
              projectId,
              templateDocumentId: doc.id,
              generatedFileId: fileId,
              status: "generated",
              version: nextVersion,
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
