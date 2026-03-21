"""
Render documents (PDF/DOCX/XLSX) as page images with field position metadata.
Used by form-on-document feature for FILL mode overlay inputs.

Usage:
  python3 document_render.py render_pdf <input_path> <output_dir>
  python3 document_render.py render_docx <input_path> <output_dir>
  python3 document_render.py render_xlsx <input_path> <output_dir>

Output:
  - Page images as PNG files in output_dir (page_1.png, page_2.png, ...)
  - JSON metadata to stdout with field positions per page
"""

import fitz  # PyMuPDF
import json
import sys
import os
import re
import subprocess
import tempfile


# ─── PDF RENDERING ──────────────────────────────────────────

def render_pdf(pdf_path, output_dir):
    """
    Render PDF pages as PNG images and extract widget (form field) positions.
    Supports both XFA-based and AcroForm-based PDF forms.
    """
    doc = fitz.open(pdf_path)
    scale = 2.0  # 2x for retina-quality rendering
    mat = fitz.Matrix(scale, scale)

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

        # Extract widget positions (AcroForm fields)
        fields = []
        for widget in page.widgets():
            rect = widget.rect
            field_name = widget.field_name or ""
            field_type_int = widget.field_type

            # Map fitz field types to our types
            type_map = {
                fitz.PDF_WIDGET_TYPE_TEXT: "text",
                fitz.PDF_WIDGET_TYPE_CHECKBOX: "select",
                fitz.PDF_WIDGET_TYPE_COMBOBOX: "select",
                fitz.PDF_WIDGET_TYPE_LISTBOX: "select",
                fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "select",
                fitz.PDF_WIDGET_TYPE_SIGNATURE: "signature",
            }
            field_type = type_map.get(field_type_int, "text")

            # Get current value
            field_value = widget.field_value or ""

            # Check field flags for multiline
            is_multiline = bool(widget.field_flags & 4096) if widget.field_flags else False

            if is_multiline:
                field_type = "textarea"

            # Normalize coordinates to percentages of page dimensions
            # This makes them resolution-independent
            fields.append({
                "fieldName": field_name,
                "fieldType": field_type,
                "currentValue": field_value,
                "rect": {
                    "x": round(rect.x0 / page_width * 100, 4),
                    "y": round(rect.y0 / page_height * 100, 4),
                    "width": round((rect.x1 - rect.x0) / page_width * 100, 4),
                    "height": round((rect.y1 - rect.y0) / page_height * 100, 4),
                },
                "rectPt": {
                    "x0": round(rect.x0, 2),
                    "y0": round(rect.y0, 2),
                    "x1": round(rect.x1, 2),
                    "y1": round(rect.y1, 2),
                },
            })

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

    # Also try XFA-based field extraction for XFA forms
    # (XFA fields may not appear as widgets)
    xfa_fields = extract_xfa_field_positions(pdf_path)
    if xfa_fields and not any(p["fields"] for p in pages):
        # If no widget fields were found but XFA fields exist,
        # distribute XFA fields across pages (XFA doesn't have page positions)
        # These will be rendered as a list overlay since we can't determine exact positions
        if pages:
            pages[0]["xfaFields"] = xfa_fields

    return {
        "format": "pdf",
        "totalPages": len(pages),
        "pages": pages,
    }


def extract_xfa_field_positions(pdf_path):
    """Extract XFA field info (without positions since XFA doesn't embed visual coords in datasets)."""
    doc = fitz.open(pdf_path)
    xref_len = doc.xref_length()

    for i in range(1, xref_len):
        try:
            stream = doc.xref_stream(i)
            if stream:
                text = stream.decode('utf-8', errors='ignore')
                if '<xfa:datasets' in text[:200]:
                    doc.close()
                    return []  # XFA exists but positions are in the template XML, not datasets
        except:
            pass

    doc.close()
    return []


# ─── DOCX RENDERING ─────────────────────────────────────────

def render_docx(docx_path, output_dir):
    """
    Convert DOCX to PDF via LibreOffice, then render pages as PNG.
    Extract placeholder positions by finding {{key}} patterns in the rendered PDF.
    """
    # Step 1: Convert DOCX to PDF using LibreOffice
    pdf_dir = tempfile.mkdtemp(prefix="docx2pdf_")
    try:
        subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", pdf_dir, docx_path],
            capture_output=True, timeout=60, check=True
        )
    except FileNotFoundError:
        # LibreOffice not available — fall back to text-based rendering
        return render_docx_text_fallback(docx_path, output_dir)
    except subprocess.CalledProcessError:
        return render_docx_text_fallback(docx_path, output_dir)

    pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith(".pdf")]
    if not pdf_files:
        return render_docx_text_fallback(docx_path, output_dir)

    pdf_path = os.path.join(pdf_dir, pdf_files[0])

    # Step 2: Render PDF pages and find placeholder text positions
    doc = fitz.open(pdf_path)
    scale = 2.0
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

        # Search for placeholder text {{key}} on this page
        fields = []
        text_page = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

        for block in text_page.get("blocks", []):
            if block.get("type") != 0:  # text block
                continue
            for line in block.get("lines", []):
                # Reconstruct line text from spans to find placeholders
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

                    # Find the bounding box that covers this match
                    x0, y0, x1, y1 = None, None, None, None
                    font_size = 12
                    for sp in span_positions:
                        if sp["end"] > match_start and sp["start"] < match_end:
                            bbox = sp["bbox"]
                            if x0 is None or bbox[0] < x0:
                                x0 = bbox[0]
                            if y0 is None or bbox[1] < y0:
                                y0 = bbox[1]
                            if x1 is None or bbox[2] > x1:
                                x1 = bbox[2]
                            if y1 is None or bbox[3] > y1:
                                y1 = bbox[3]
                            font_size = sp["size"]

                    if x0 is not None:
                        # Expand width to give space for actual input
                        input_width = max(x1 - x0, 120)

                        fields.append({
                            "fieldName": key,
                            "fieldType": "text",
                            "currentValue": "",
                            "rect": {
                                "x": round(x0 / page_width * 100, 4),
                                "y": round(y0 / page_height * 100, 4),
                                "width": round(input_width / page_width * 100, 4),
                                "height": round((y1 - y0) / page_height * 100, 4),
                            },
                            "rectPt": {
                                "x0": round(x0, 2),
                                "y0": round(y0, 2),
                                "x1": round(x0 + input_width, 2),
                                "y1": round(y1, 2),
                            },
                            "fontSize": round(font_size, 1),
                        })

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

    # Cleanup temp PDF
    try:
        os.unlink(pdf_path)
        os.rmdir(pdf_dir)
    except:
        pass

    return {
        "format": "docx",
        "totalPages": len(pages),
        "pages": pages,
    }


def render_docx_text_fallback(docx_path, output_dir):
    """
    Fallback when LibreOffice is not available.
    Extract placeholders from DOCX with approximate positions using python-docx.
    Render pages as placeholder layout images using PyMuPDF drawing.
    """
    from docx import Document
    from docx.shared import Pt

    doc = Document(docx_path)
    placeholder_pattern = re.compile(r'\{\{([^}]+)\}\}')

    # A4 page dimensions in points
    page_width = 595.28
    page_height = 841.89
    margin_x = 56  # ~2cm margins
    margin_y = 72
    line_height = 16
    max_y = page_height - margin_y

    pages = []
    current_page_fields = []
    current_y = margin_y
    current_page = 1

    # Create a PDF document for rendering the layout
    pdf_doc = fitz.open()

    def flush_page():
        nonlocal current_page, current_y, current_page_fields
        page = pdf_doc.new_page(width=page_width, height=page_height)

        # Draw all text blocks (simplified rendering)
        y = margin_y
        for block in page_blocks:
            if block["type"] == "text":
                page.insert_text(
                    fitz.Point(margin_x, y + 12),
                    block["text"],
                    fontsize=block.get("fontSize", 11),
                    fontname="helv",
                    color=(0.1, 0.1, 0.15),
                )
                y += block.get("height", line_height)
            elif block["type"] == "placeholder":
                # Draw placeholder box
                rect = fitz.Rect(
                    block["x"], block["y"],
                    block["x"] + block["width"], block["y"] + block["height"]
                )
                page.draw_rect(rect, color=(0.3, 0.55, 1.0), width=0.5)
                page.insert_text(
                    fitz.Point(block["x"] + 4, block["y"] + 12),
                    "{{" + block["key"] + "}}",
                    fontsize=9,
                    fontname="helv",
                    color=(0.4, 0.5, 0.65),
                )
                y = block["y"] + block["height"] + 4

    page_blocks = []

    for para in doc.paragraphs:
        text = para.text
        is_page_break = any(
            'w:br' in run._element.xml and 'type="page"' in run._element.xml
            for run in para.runs
        )

        if is_page_break or current_y > max_y:
            # Render current page
            page = pdf_doc.new_page(width=page_width, height=page_height)
            scale = 2.0
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
                "fields": current_page_fields,
            })

            current_page += 1
            current_page_fields = []
            current_y = margin_y

        # Find placeholders in this paragraph
        for match in placeholder_pattern.finditer(text):
            key = match.group(1).strip()

            # Approximate the position based on character offset
            char_width = 6.5  # approximate for 11pt font
            x = margin_x + match.start() * char_width
            if x > page_width - margin_x:
                x = margin_x
            input_width = max(len(key) * char_width + 20, 120)
            if x + input_width > page_width - margin_x:
                input_width = page_width - margin_x - x

            current_page_fields.append({
                "fieldName": key,
                "fieldType": "text",
                "currentValue": "",
                "rect": {
                    "x": round(x / page_width * 100, 4),
                    "y": round(current_y / page_height * 100, 4),
                    "width": round(input_width / page_width * 100, 4),
                    "height": round(line_height / page_height * 100, 4),
                },
                "rectPt": {
                    "x0": round(x, 2),
                    "y0": round(current_y, 2),
                    "x1": round(x + input_width, 2),
                    "y1": round(current_y + line_height, 2),
                },
            })

        current_y += line_height
        if text.strip():
            current_y += 2  # paragraph spacing

    # Flush last page
    if current_page_fields or current_y > margin_y:
        page = pdf_doc.new_page(width=page_width, height=page_height)
        scale = 2.0
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
            "fields": current_page_fields,
        })

    pdf_doc.close()

    return {
        "format": "docx",
        "totalPages": len(pages),
        "pages": pages,
    }


# ─── XLSX RENDERING ─────────────────────────────────────────

def render_xlsx(xlsx_path, output_dir):
    """
    Convert XLSX to PDF via LibreOffice then render pages as PNG.
    Extract placeholder positions from the rendered output.
    Falls back to grid-based HTML rendering data if LibreOffice unavailable.
    """
    # Try LibreOffice conversion
    pdf_dir = tempfile.mkdtemp(prefix="xlsx2pdf_")
    try:
        subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", pdf_dir, xlsx_path],
            capture_output=True, timeout=60, check=True
        )
        pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith(".pdf")]
        if pdf_files:
            pdf_path = os.path.join(pdf_dir, pdf_files[0])
            result = render_pdf_with_text_search(pdf_path, output_dir)
            result["format"] = "xlsx"
            try:
                os.unlink(pdf_path)
                os.rmdir(pdf_dir)
            except:
                pass
            return result
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    # Fallback: extract grid structure
    return render_xlsx_grid_fallback(xlsx_path, output_dir)


def render_pdf_with_text_search(pdf_path, output_dir):
    """Render PDF pages and search for {{placeholder}} text positions."""
    doc = fitz.open(pdf_path)
    scale = 2.0
    mat = fitz.Matrix(scale, scale)
    placeholder_pattern = re.compile(r'\{\{([^}]+)\}\}')

    pages = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_path = os.path.join(output_dir, f"page_{page_idx + 1}.png")
        pix.save(img_path)

        page_rect = page.rect
        page_width = page_rect.width
        page_height = page_rect.height

        # Search for placeholders using text search
        fields = []
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
                        "size": span.get("size", 10),
                    })

                for match in placeholder_pattern.finditer(line_text):
                    key = match.group(1).strip()
                    match_start = match.start()
                    match_end = match.end()

                    x0, y0, x1, y1 = None, None, None, None
                    font_size = 10
                    for sp in span_positions:
                        if sp["end"] > match_start and sp["start"] < match_end:
                            bbox = sp["bbox"]
                            if x0 is None or bbox[0] < x0:
                                x0 = bbox[0]
                            if y0 is None or bbox[1] < y0:
                                y0 = bbox[1]
                            if x1 is None or bbox[2] > x1:
                                x1 = bbox[2]
                            if y1 is None or bbox[3] > y1:
                                y1 = bbox[3]
                            font_size = sp["size"]

                    if x0 is not None:
                        input_width = max(x1 - x0, 100)
                        fields.append({
                            "fieldName": key,
                            "fieldType": "text",
                            "currentValue": "",
                            "rect": {
                                "x": round(x0 / page_width * 100, 4),
                                "y": round(y0 / page_height * 100, 4),
                                "width": round(input_width / page_width * 100, 4),
                                "height": round((y1 - y0) / page_height * 100, 4),
                            },
                            "rectPt": {
                                "x0": round(x0, 2),
                                "y0": round(y0, 2),
                                "x1": round(x0 + input_width, 2),
                                "y1": round(y1, 2),
                            },
                            "fontSize": round(font_size, 1),
                        })

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
    return {
        "format": "pdf",
        "totalPages": len(pages),
        "pages": pages,
    }


def render_xlsx_grid_fallback(xlsx_path, output_dir):
    """
    Fallback: generate a grid-based rendering for XLSX.
    Renders each sheet as a page image using PyMuPDF drawing primitives.
    """
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    placeholder_pattern = re.compile(r'\{\{([^}]+)\}\}')

    pages = []
    scale = 2.0

    for sheet_idx, sheet_name in enumerate(wb.sheetnames):
        ws = wb[sheet_name]

        # Calculate dimensions
        col_widths = {}
        for col_idx in range(1, ws.max_column + 1):
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            dim = ws.column_dimensions.get(col_letter)
            col_widths[col_idx] = (dim.width if dim and dim.width else 10) * 7  # approximate pt

        row_heights = {}
        for row_idx in range(1, ws.max_row + 1):
            dim = ws.row_dimensions.get(row_idx)
            row_heights[row_idx] = dim.height if dim and dim.height else 18

        # Calculate total dimensions
        margin = 30
        total_width = sum(col_widths.values()) + margin * 2
        total_height = sum(row_heights.values()) + margin * 2

        # Cap to reasonable page size
        page_width = max(total_width, 595)
        page_height = max(total_height, 400)

        # Create page image using PyMuPDF
        pdf_doc = fitz.open()
        page = pdf_doc.new_page(width=page_width, height=page_height)

        # Draw grid and cells
        fields = []
        y = margin
        for row_idx in range(1, ws.max_row + 1):
            x = margin
            rh = row_heights.get(row_idx, 18)

            for col_idx in range(1, ws.max_column + 1):
                cw = col_widths.get(col_idx, 70)
                cell = ws.cell(row=row_idx, column=col_idx)

                # Draw cell border
                rect = fitz.Rect(x, y, x + cw, y + rh)
                page.draw_rect(rect, color=(0.78, 0.82, 0.88), width=0.3)

                # Draw cell value
                val = str(cell.value) if cell.value is not None else ""
                if val:
                    # Check for placeholders
                    for match in placeholder_pattern.finditer(val):
                        key = match.group(1).strip()
                        fields.append({
                            "fieldName": key,
                            "fieldType": "text",
                            "currentValue": "",
                            "rect": {
                                "x": round(x / page_width * 100, 4),
                                "y": round(y / page_height * 100, 4),
                                "width": round(cw / page_width * 100, 4),
                                "height": round(rh / page_height * 100, 4),
                            },
                            "rectPt": {
                                "x0": round(x, 2),
                                "y0": round(y, 2),
                                "x1": round(x + cw, 2),
                                "y1": round(y + rh, 2),
                            },
                            "cellRef": f"{openpyxl.utils.get_column_letter(col_idx)}{row_idx}",
                            "sheetName": sheet_name,
                        })

                    # Truncate text to fit
                    display = val[:int(cw / 5)] if len(val) > cw / 5 else val
                    try:
                        page.insert_text(
                            fitz.Point(x + 3, y + rh - 5),
                            display,
                            fontsize=8,
                            fontname="helv",
                            color=(0.1, 0.1, 0.15),
                        )
                    except:
                        pass

                x += cw
            y += rh

        # Save page image
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
        })

        pdf_doc.close()

    return {
        "format": "xlsx",
        "totalPages": len(pages),
        "pages": pages,
    }


# ─── MAIN ────────────────────────────────────────────────────

if __name__ == "__main__":
    action = sys.argv[1]
    input_path = sys.argv[2]
    output_dir = sys.argv[3]

    os.makedirs(output_dir, exist_ok=True)

    if action == "render_pdf":
        result = render_pdf(input_path, output_dir)
    elif action == "render_docx":
        result = render_docx(input_path, output_dir)
    elif action == "render_xlsx":
        result = render_xlsx(input_path, output_dir)
    else:
        result = {"error": f"Unknown action: {action}"}

    print(json.dumps(result, ensure_ascii=False))
