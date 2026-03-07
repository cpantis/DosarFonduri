import { db } from "../db";
import {
  projects, projectElements, projectDocuments,
  templateElements, documents, orgConfig,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getFileBuffer, uploadFile } from "./storage";

// ═══ FILL DOCX TEMPLATE ═══
async function fillDocxTemplate(
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

  const scriptPath = path.join(tmpDir, `fill_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    execSync(`python3 "${scriptPath}" "${inputPath}" "${outputPath}" "${dataPath}"`, {
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

  const scriptPath = path.join(tmpDir, `fill_xlsx_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    execSync(`python3 "${scriptPath}" "${inputPath}" "${outputPath}" "${dataPath}"`, {
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
export async function generateDocument(params: GenerateDocParams): Promise<ReadableStream> {
  const { projectId, templateDocumentId, organizationId, userId } = params;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se pregătește template-ul..." })}\n\n`));

        const templateDoc = await db.query.documents.findFirst({
          where: eq(documents.id, templateDocumentId),
        });
        if (!templateDoc) throw new Error("Template not found");

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

        // Upload generated doc
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Se salvează documentul..." })}\n\n`));

        const generatedFileName = `${templateDoc.name}_completat_${new Date().toISOString().slice(0, 10)}.${templateDoc.fileType}`;
        const fileId = await uploadFile(
          filledBuffer,
          generatedFileName,
          templateDoc.fileType === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          organizationId,
          userId,
        );

        // Save in project_documents
        const [projectDoc] = await db.insert(projectDocuments).values({
          projectId,
          templateDocumentId,
          generatedFileId: fileId,
          status: "generated",
          pagesCompleted: templateDoc.pageCount || 0,
          totalPages: templateDoc.pageCount || 0,
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
): Promise<{ canGenerate: boolean; warnings: string[]; errors: string[] }> {
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
    warnings.push(`${unvalidatedTemplate.length} elemente din template nu sunt validate`);
  }

  // Check missing values
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

  // Check unconfirmed elements
  const unconfirmed = projectEls.filter(pe =>
    pe.value && pe.value.trim() !== "" && !pe.confirmed
  );
  if (unconfirmed.length > 0) {
    warnings.push(`${unconfirmed.length} câmpuri completate dar neconfirmate`);
  }

  return { canGenerate: errors.length === 0, warnings, errors };
}
