"""
Render documents (PDF/DOCX/XLSX) as page images with field position metadata.
Used by form-on-document feature for FILL mode overlay inputs.

Usage:
  python3 document_render.py render <input_path> <output_dir> [known_keys_json]

The script:
1. Renders each page as a high-quality PNG image
2. Extracts ALL detectable field positions (widgets, placeholders, text markers)
3. If known_keys_json is provided, reconciles detected fields with known template keys
   using fuzzy matching — this ensures the output uses the SAME keys as template_elements

Output (JSON to stdout):
  - Page images in output_dir
  - Field metadata with position coordinates and match quality
"""

import fitz  # PyMuPDF
import json
import sys
import os
import re
import subprocess
import tempfile
import unicodedata


# ═══ FUZZY MATCHING ══════════════════════════════════════════
# Same algorithm as elementDefinitionService.ts bigram similarity

def normalize_key(s):
    """Normalize key for fuzzy comparison: lowercase, remove non-alphanumeric, strip diacritics."""
    if not s:
        return ""
    # Remove diacritics
    nfkd = unicodedata.normalize('NFKD', s)
    ascii_str = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', ascii_str.lower())


def bigram_similarity(a, b):
    """Compute bigram (Dice) similarity between two strings. Returns 0.0-1.0."""
    na = normalize_key(a)
    nb = normalize_key(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if len(na) < 2 or len(nb) < 2:
        # For very short strings, use simple containment
        if na in nb or nb in na:
            return 0.8
        return 0.0
    bigrams_a = set(na[i:i+2] for i in range(len(na) - 1))
    bigrams_b = set(nb[i:i+2] for i in range(len(nb) - 1))
    intersection = bigrams_a & bigrams_b
    return 2.0 * len(intersection) / (len(bigrams_a) + len(bigrams_b))


def reconcile_fields(detected_fields, known_keys):
    """
    Reconcile detected field positions with known template_elements keys.

    For each known key, find the best matching detected field position.
    For each detected field, find the best matching known key.

    Returns reconciled fields with:
    - matchQuality: "exact" | "normalized" | "fuzzy" | "unmatched"
    - matchConfidence: 0.0-1.0
    - knownKey: the template_elements key (source of truth)
    - detectedKey: the original detected key
    """
    if not known_keys:
        return detected_fields  # No reconciliation needed

    # Build lookup for known keys
    known_normalized = {normalize_key(k["key"]): k for k in known_keys}
    known_by_key = {k["key"]: k for k in known_keys}

    # Track which known keys have been matched
    matched_known = set()
    reconciled = []

    for field in detected_fields:
        detected_key = field.get("fieldName", "")
        detected_norm = normalize_key(detected_key)

        best_match = None
        best_score = 0.0
        match_quality = "unmatched"

        # 1. Exact match
        if detected_key in known_by_key:
            best_match = known_by_key[detected_key]
            best_score = 1.0
            match_quality = "exact"

        # 2. Normalized match
        elif detected_norm in known_normalized:
            best_match = known_normalized[detected_norm]
            best_score = 0.95
            match_quality = "normalized"

        # 3. Fuzzy match (bigram similarity)
        else:
            for kk in known_keys:
                if kk["key"] in matched_known:
                    continue
                score = bigram_similarity(detected_key, kk["key"])
                # Also try matching against label
                label_score = bigram_similarity(detected_key, kk.get("label", "")) * 0.85
                score = max(score, label_score)
                if score > best_score and score >= 0.6:
                    best_score = score
                    best_match = kk
                    match_quality = "fuzzy"

        if best_match:
            matched_known.add(best_match["key"])
            field["knownKey"] = best_match["key"]
            field["knownLabel"] = best_match.get("label", "")
            field["knownFieldType"] = best_match.get("fieldType", "text")
            field["knownPageNum"] = best_match.get("pageNum")
            field["matchQuality"] = match_quality
            field["matchConfidence"] = round(best_score, 3)
            # Use the known key as fieldName (source of truth)
            field["detectedKey"] = detected_key
            field["fieldName"] = best_match["key"]
        else:
            field["detectedKey"] = detected_key
            field["matchQuality"] = "unmatched"
            field["matchConfidence"] = 0.0

        reconciled.append(field)

    # Report unmatched known keys (fields in DB that we couldn't find on the rendered page)
    unmatched_known = []
    for kk in known_keys:
        if kk["key"] not in matched_known:
            unmatched_known.append({
                "key": kk["key"],
                "label": kk.get("label", ""),
                "fieldType": kk.get("fieldType", "text"),
                "pageNum": kk.get("pageNum"),
                "matchQuality": "db_only",
                "matchConfidence": 0.0,
            })

    return reconciled, unmatched_known


# ═══ SHARED: Extract placeholder text positions from rendered PDF ═══

def extract_placeholder_positions(pdf_path, output_dir, scale=2.0):
    """
    Render PDF pages as PNG images and find {{placeholder}} text positions.
    Returns page metadata with field positions in percentage coordinates.
    """
    doc = fitz.open(pdf_path)
    mat = fitz.Matrix(scale, scale)
    placeholder_pattern = re.compile(r'\{\{([^}]+)\}\}')

    pages = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]

        # Render page as PNG
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_path = os.path.join(output_dir, f"page_{page_idx + 1}.png")
        pix.save(img_path)

        page_rect = page.rect
        page_width = page_rect.width
        page_height = page_rect.height

        fields = []

        # Method 1: Search for {{placeholder}} text patterns
        text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_text = ""
                span_positions = []
                for span in line.get("spans", []):
                    start_idx = len(line_text)
                    line_text += span.get("text", "")
                    span_positions.append({
                        "start": start_idx,
                        "end": len(line_text),
                        "bbox": span.get("bbox", [0, 0, 0, 0]),
                        "size": span.get("size", 12),
                    })

                for match in placeholder_pattern.finditer(line_text):
                    key = match.group(1).strip()
                    match_start = match.start()
                    match_end = match.end()

                    x0, y0, x1, y1 = None, None, None, None
                    font_size = 12
                    for sp in span_positions:
                        if sp["end"] > match_start and sp["start"] < match_end:
                            bbox = sp["bbox"]
                            if x0 is None or bbox[0] < x0: x0 = bbox[0]
                            if y0 is None or bbox[1] < y0: y0 = bbox[1]
                            if x1 is None or bbox[2] > x1: x1 = bbox[2]
                            if y1 is None or bbox[3] > y1: y1 = bbox[3]
                            font_size = sp["size"]

                    if x0 is not None:
                        input_width = max(x1 - x0, 100)
                        fields.append({
                            "fieldName": key,
                            "fieldType": "text",
                            "currentValue": "",
                            "positionSource": "text_search",
                            "rect": {
                                "x": round(x0 / page_width * 100, 4),
                                "y": round(y0 / page_height * 100, 4),
                                "width": round(input_width / page_width * 100, 4),
                                "height": round((y1 - y0) / page_height * 100, 4),
                            },
                            "fontSize": round(font_size, 1),
                        })

        # Method 2: Extract AcroForm widget positions (for PDFs with form fields)
        try:
            for widget in page.widgets():
                rect = widget.rect
                field_name = widget.field_name or ""
                if not field_name:
                    continue

                type_map = {
                    fitz.PDF_WIDGET_TYPE_TEXT: "text",
                    fitz.PDF_WIDGET_TYPE_CHECKBOX: "select",
                    fitz.PDF_WIDGET_TYPE_COMBOBOX: "select",
                    fitz.PDF_WIDGET_TYPE_LISTBOX: "select",
                    fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "select",
                    fitz.PDF_WIDGET_TYPE_SIGNATURE: "signature",
                }
                field_type = type_map.get(widget.field_type, "text")

                is_multiline = bool(widget.field_flags & 4096) if widget.field_flags else False
                if is_multiline:
                    field_type = "textarea"

                # Check if we already found this field via text search
                # (avoid duplicates for the same position)
                already_found = False
                for existing in fields:
                    ex_rect = existing["rect"]
                    # Check if positions overlap significantly
                    dx = abs(ex_rect["x"] - (rect.x0 / page_width * 100))
                    dy = abs(ex_rect["y"] - (rect.y0 / page_height * 100))
                    if dx < 2 and dy < 2:
                        already_found = True
                        # Prefer widget position (more accurate than text search)
                        existing["positionSource"] = "widget"
                        existing["rect"] = {
                            "x": round(rect.x0 / page_width * 100, 4),
                            "y": round(rect.y0 / page_height * 100, 4),
                            "width": round((rect.x1 - rect.x0) / page_width * 100, 4),
                            "height": round((rect.y1 - rect.y0) / page_height * 100, 4),
                        }
                        break

                if not already_found:
                    fields.append({
                        "fieldName": field_name,
                        "fieldType": field_type,
                        "currentValue": widget.field_value or "",
                        "positionSource": "widget",
                        "rect": {
                            "x": round(rect.x0 / page_width * 100, 4),
                            "y": round(rect.y0 / page_height * 100, 4),
                            "width": round((rect.x1 - rect.x0) / page_width * 100, 4),
                            "height": round((rect.y1 - rect.y0) / page_height * 100, 4),
                        },
                    })
        except Exception:
            pass  # Some PDFs don't support widget iteration

        pages.append({
            "pageNum": page_idx + 1,
            "imageName": f"page_{page_idx + 1}.png",
            "widthPt": round(page_width, 2),
            "heightPt": round(page_height, 2),
            "widthPx": pix.width,
            "heightPx": pix.height,
            "scale": scale,
            "fields": fields,
        })

    doc.close()
    return pages


# ═══ PDF RENDERING ══════════════════════════════════════════

def render_pdf(pdf_path, output_dir, known_keys=None):
    """Render PDF pages as PNG images and extract field positions."""
    pages = extract_placeholder_positions(pdf_path, output_dir)

    # Flatten all fields for reconciliation
    all_fields = []
    for page in pages:
        for field in page["fields"]:
            field["pageNum"] = page["pageNum"]
            all_fields.append(field)

    # Reconcile with known keys
    unmatched_known = []
    if known_keys:
        reconciled, unmatched_known = reconcile_fields(all_fields, known_keys)
        # Re-distribute reconciled fields back to pages
        for page in pages:
            page["fields"] = [f for f in reconciled if f.get("pageNum") == page["pageNum"]]

    return {
        "format": "pdf",
        "totalPages": len(pages),
        "pages": pages,
        "unmatchedKnownKeys": unmatched_known,
    }


# ═══ DOCX RENDERING ═════════════════════════════════════════

def render_docx(docx_path, output_dir, known_keys=None):
    """Convert DOCX to PDF via LibreOffice, then render pages as PNG."""
    pdf_dir = tempfile.mkdtemp(prefix="docx2pdf_")
    pdf_path = None

    try:
        subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", pdf_dir, docx_path],
            capture_output=True, timeout=60, check=True
        )
        pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith(".pdf")]
        if pdf_files:
            pdf_path = os.path.join(pdf_dir, pdf_files[0])
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    if pdf_path:
        pages = extract_placeholder_positions(pdf_path, output_dir)
        try:
            os.unlink(pdf_path)
            os.rmdir(pdf_dir)
        except:
            pass
    else:
        # Fallback: direct DOCX placeholder extraction with approximate positions
        pages = render_docx_fallback(docx_path, output_dir)

    # Flatten all fields for reconciliation
    all_fields = []
    for page in pages:
        for field in page["fields"]:
            field["pageNum"] = page["pageNum"]
            all_fields.append(field)

    unmatched_known = []
    if known_keys:
        reconciled, unmatched_known = reconcile_fields(all_fields, known_keys)
        for page in pages:
            page["fields"] = [f for f in reconciled if f.get("pageNum") == page["pageNum"]]

    return {
        "format": "docx",
        "totalPages": len(pages),
        "pages": pages,
        "unmatchedKnownKeys": unmatched_known,
    }


def render_docx_fallback(docx_path, output_dir):
    """Fallback when LibreOffice is not available. Extract placeholders with approximate positions."""
    from docx import Document

    doc = Document(docx_path)
    placeholder_pattern = re.compile(r'\{\{([^}]+)\}\}')

    page_width = 595.28  # A4 in points
    page_height = 841.89
    margin_x = 56
    margin_y = 72
    line_height = 16
    max_y = page_height - margin_y
    scale = 2.0

    pages = []
    current_fields = []
    current_y = margin_y
    current_page = 1

    pdf_doc = fitz.open()

    def flush_page():
        nonlocal current_page, current_y, current_fields
        page = pdf_doc.new_page(width=page_width, height=page_height)
        # Draw a subtle grid/watermark to show it's a fallback render
        page.insert_text(
            fitz.Point(margin_x, margin_y - 10),
            f"[Previzualizare aproximativă — pagina {current_page}]",
            fontsize=8, fontname="helv", color=(0.6, 0.65, 0.75),
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        img_path = os.path.join(output_dir, f"page_{current_page}.png")
        pix.save(img_path)
        pages.append({
            "pageNum": current_page,
            "imageName": f"page_{current_page}.png",
            "widthPt": round(page_width, 2),
            "heightPt": round(page_height, 2),
            "widthPx": pix.width,
            "heightPx": pix.height,
            "scale": scale,
            "fields": current_fields,
            "isFallbackRender": True,
        })
        current_page += 1
        current_fields = []
        current_y = margin_y

    for para in doc.paragraphs:
        text = para.text
        is_page_break = any(
            'w:br' in run._element.xml and 'type="page"' in run._element.xml
            for run in para.runs
        )

        if is_page_break or current_y > max_y:
            flush_page()

        for match in placeholder_pattern.finditer(text):
            key = match.group(1).strip()
            char_width = 6.5
            x = margin_x + match.start() * char_width
            if x > page_width - margin_x:
                x = margin_x
            input_width = max(len(key) * char_width + 20, 120)
            if x + input_width > page_width - margin_x:
                input_width = page_width - margin_x - x

            current_fields.append({
                "fieldName": key,
                "fieldType": "text",
                "currentValue": "",
                "positionSource": "text_extraction",
                "rect": {
                    "x": round(x / page_width * 100, 4),
                    "y": round(current_y / page_height * 100, 4),
                    "width": round(input_width / page_width * 100, 4),
                    "height": round(line_height / page_height * 100, 4),
                },
            })

        current_y += line_height
        if text.strip():
            current_y += 2

    if current_fields or current_y > margin_y:
        flush_page()

    pdf_doc.close()
    return pages


# ═══ XLSX RENDERING ══════════════════════════════════════════

def render_xlsx(xlsx_path, output_dir, known_keys=None):
    """Convert XLSX to PDF via LibreOffice then render pages as PNG."""
    pdf_dir = tempfile.mkdtemp(prefix="xlsx2pdf_")
    pdf_path = None

    try:
        subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", pdf_dir, xlsx_path],
            capture_output=True, timeout=60, check=True
        )
        pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith(".pdf")]
        if pdf_files:
            pdf_path = os.path.join(pdf_dir, pdf_files[0])
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    if pdf_path:
        pages = extract_placeholder_positions(pdf_path, output_dir)
        try:
            os.unlink(pdf_path)
            os.rmdir(pdf_dir)
        except:
            pass
    else:
        pages = render_xlsx_fallback(xlsx_path, output_dir)

    # Flatten + reconcile
    all_fields = []
    for page in pages:
        for field in page["fields"]:
            field["pageNum"] = page["pageNum"]
            all_fields.append(field)

    unmatched_known = []
    if known_keys:
        reconciled, unmatched_known = reconcile_fields(all_fields, known_keys)
        for page in pages:
            page["fields"] = [f for f in reconciled if f.get("pageNum") == page["pageNum"]]

    return {
        "format": "xlsx",
        "totalPages": len(pages),
        "pages": pages,
        "unmatchedKnownKeys": unmatched_known,
    }


def render_xlsx_fallback(xlsx_path, output_dir):
    """Fallback: render XLSX grid using PyMuPDF drawing."""
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    placeholder_pattern = re.compile(r'\{\{([^}]+)\}\}')
    scale = 2.0
    pages = []

    for sheet_idx, sheet_name in enumerate(wb.sheetnames):
        ws = wb[sheet_name]

        col_widths = {}
        for col_idx in range(1, (ws.max_column or 1) + 1):
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            dim = ws.column_dimensions.get(col_letter)
            col_widths[col_idx] = (dim.width if dim and dim.width else 10) * 7

        row_heights = {}
        for row_idx in range(1, (ws.max_row or 1) + 1):
            dim = ws.row_dimensions.get(row_idx)
            row_heights[row_idx] = dim.height if dim and dim.height else 18

        margin = 30
        total_width = sum(col_widths.values()) + margin * 2
        total_height = sum(row_heights.values()) + margin * 2
        page_width = max(total_width, 595)
        page_height = max(total_height, 400)

        pdf_doc = fitz.open()
        page = pdf_doc.new_page(width=page_width, height=page_height)

        fields = []
        y = margin
        for row_idx in range(1, (ws.max_row or 1) + 1):
            x = margin
            rh = row_heights.get(row_idx, 18)

            for col_idx in range(1, (ws.max_column or 1) + 1):
                cw = col_widths.get(col_idx, 70)
                cell = ws.cell(row=row_idx, column=col_idx)
                rect = fitz.Rect(x, y, x + cw, y + rh)
                page.draw_rect(rect, color=(0.78, 0.82, 0.88), width=0.3)

                val = str(cell.value) if cell.value is not None else ""
                if val:
                    for match in placeholder_pattern.finditer(val):
                        key = match.group(1).strip()
                        fields.append({
                            "fieldName": key,
                            "fieldType": "text",
                            "currentValue": "",
                            "positionSource": "cell_extraction",
                            "rect": {
                                "x": round(x / page_width * 100, 4),
                                "y": round(y / page_height * 100, 4),
                                "width": round(cw / page_width * 100, 4),
                                "height": round(rh / page_height * 100, 4),
                            },
                            "cellRef": f"{openpyxl.utils.get_column_letter(col_idx)}{row_idx}",
                            "sheetName": sheet_name,
                        })

                    display = val[:int(cw / 5)] if len(val) > cw / 5 else val
                    try:
                        page.insert_text(
                            fitz.Point(x + 3, y + rh - 5), display,
                            fontsize=8, fontname="helv", color=(0.1, 0.1, 0.15),
                        )
                    except:
                        pass
                x += cw
            y += rh

        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        img_path = os.path.join(output_dir, f"page_{sheet_idx + 1}.png")
        pix.save(img_path)

        pages.append({
            "pageNum": sheet_idx + 1,
            "imageName": f"page_{sheet_idx + 1}.png",
            "sheetName": sheet_name,
            "widthPt": round(page_width, 2),
            "heightPt": round(page_height, 2),
            "widthPx": pix.width,
            "heightPx": pix.height,
            "scale": scale,
            "fields": fields,
            "isFallbackRender": True,
        })
        pdf_doc.close()

    return pages


# ═══ MAIN ════════════════════════════════════════════════════

if __name__ == "__main__":
    action = sys.argv[1]
    input_path = sys.argv[2]
    output_dir = sys.argv[3]
    known_keys_path = sys.argv[4] if len(sys.argv) > 4 else None

    os.makedirs(output_dir, exist_ok=True)

    # Load known keys from template_elements (if provided)
    known_keys = None
    if known_keys_path and os.path.exists(known_keys_path):
        with open(known_keys_path, 'r', encoding='utf-8') as f:
            known_keys = json.load(f)

    file_ext = input_path.rsplit('.', 1)[-1].lower() if '.' in input_path else ''

    if action == "render":
        if file_ext == 'pdf':
            result = render_pdf(input_path, output_dir, known_keys)
        elif file_ext in ('docx', 'doc'):
            result = render_docx(input_path, output_dir, known_keys)
        elif file_ext in ('xlsx', 'xls'):
            result = render_xlsx(input_path, output_dir, known_keys)
        else:
            result = {"error": f"Unsupported file type: {file_ext}"}
    # Legacy actions for backward compatibility
    elif action == "render_pdf":
        result = render_pdf(input_path, output_dir, known_keys)
    elif action == "render_docx":
        result = render_docx(input_path, output_dir, known_keys)
    elif action == "render_xlsx":
        result = render_xlsx(input_path, output_dir, known_keys)
    else:
        result = {"error": f"Unknown action: {action}"}

    print(json.dumps(result, ensure_ascii=False))
