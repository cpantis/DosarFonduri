import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface XFAField {
  key: string;
  label: string;
  fieldType: "text" | "number" | "textarea" | "date" | "select" | "checkbox" | "signature";
  group: string;
  isRepeating: boolean;
  rowIndex: number | null;
}

/**
 * Extract XFA form fields from a PDF using PyMuPDF XML parsing.
 * Filters out internal PDF fields (pdfVersion, Button, etc.)
 * Generates human-readable labels from CamelCase field names.
 */
export async function extractXFAFields(buffer: Buffer): Promise<XFAField[]> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xfa_${Date.now()}.pdf`);
  fs.writeFileSync(inputPath, buffer);

  const script = `
import sys, json, re
import fitz  # PyMuPDF

SKIP_FIELDS = {
    'pdfVersion', 'Button', 'ImageField', 'Subform',
    'pageArea', 'contentArea', 'draw', 'overflow'
}

FIELD_TYPE_MAP = {
    'field': 'text',
    'numericEdit': 'number',
    'textEdit': 'text',
    'dateTimeEdit': 'date',
    'choiceList': 'select',
    'checkButton': 'checkbox',
    'signature': 'signature',
}

def camel_to_label(name):
    """NumeSolicitant -> Nume Solicitant"""
    name = re.sub(r'([A-Z])', r' \\1', name).strip()
    name = re.sub(r'\\[\\d+\\]', '', name)
    name = name.replace('.', ' > ')
    return name

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)

fields = []

# Try widget-based extraction first (AcroForm)
for page_num, page in enumerate(doc):
    for widget in page.widgets():
        name = widget.field_name or ''
        if not name or name in SKIP_FIELDS:
            continue
        parts = name.split('.')
        base = parts[-1]
        if base in SKIP_FIELDS:
            continue

        ft = widget.field_type
        field_type = 'text'
        if ft == fitz.PDF_WIDGET_TYPE_TEXT:
            field_type = 'text'
        elif ft == fitz.PDF_WIDGET_TYPE_CHECKBOX:
            field_type = 'select'
        elif ft == fitz.PDF_WIDGET_TYPE_COMBOBOX or ft == fitz.PDF_WIDGET_TYPE_LISTBOX:
            field_type = 'select'
        elif ft == fitz.PDF_WIDGET_TYPE_SIGNATURE:
            field_type = 'signature'

        # Detect repeating fields (e.g., B1.Row[0].Col)
        is_repeating = bool(re.search(r'\\[\\d+\\]', name))
        row_match = re.search(r'\\[(\\d+)\\]', name)
        row_index = int(row_match.group(1)) if row_match else None

        group = parts[0] if len(parts) > 1 else 'general'

        fields.append({
            'key': name,
            'label': camel_to_label(base),
            'fieldType': field_type,
            'group': group,
            'isRepeating': is_repeating,
            'rowIndex': row_index,
        })

doc.close()
print(json.dumps(fields))
`;

  const scriptPath = path.join(tmpDir, `extract_xfa_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    const result = execSync(`python3 ${scriptPath} ${inputPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result);
  } catch (error) {
    console.error("XFA extraction failed:", error);
    return [];
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}

/**
 * Fill XFA fields in a PDF with provided values.
 * Returns the filled PDF buffer.
 */
export async function fillXFAFields(
  buffer: Buffer,
  values: Record<string, string>,
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `xfa_fill_${Date.now()}.pdf`);
  const outputPath = path.join(tmpDir, `xfa_filled_${Date.now()}.pdf`);
  const valuesPath = path.join(tmpDir, `xfa_vals_${Date.now()}.json`);

  fs.writeFileSync(inputPath, buffer);
  fs.writeFileSync(valuesPath, JSON.stringify(values));

  const script = `
import sys, json
import fitz

pdf_path = sys.argv[1]
output_path = sys.argv[2]
values_path = sys.argv[3]

with open(values_path) as f:
    values = json.load(f)

doc = fitz.open(pdf_path)

for page in doc:
    for widget in page.widgets():
        name = widget.field_name or ''
        if name in values:
            widget.field_value = values[name]
            widget.update()

doc.save(output_path)
doc.close()
`;

  const scriptPath = path.join(tmpDir, `fill_xfa_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, script);

  try {
    execSync(`python3 ${scriptPath} ${inputPath} ${outputPath} ${valuesPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return fs.readFileSync(outputPath);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
    try { fs.unlinkSync(valuesPath); } catch {}
    try { fs.unlinkSync(scriptPath); } catch {}
  }
}
