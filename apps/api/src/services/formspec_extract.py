#!/usr/bin/env python3
"""
FormSpec Universal Extractor — single entry point for all form formats.

Usage:
  python3 formspec_extract.py detect <file_path>
  python3 formspec_extract.py extract <file_path>

Output: JSON to stdout

Supported formats:
  - XFA PDF (PyMuPDF xref parsing)
  - AcroForm PDF (PyMuPDF widgets)
  - DOCX templates (python-docx)
  - XLSX (openpyxl)
"""

import sys
import json
import os
import re
import uuid
from typing import Optional


# =========================================================
# FORMSPEC DATA STRUCTURES
# =========================================================

def make_field(name, label, field_type="text", required=False, validation=None,
               source_ref=None, options=None, formula_ref=None):
    field = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "label": label,
        "fieldType": field_type,
        "required": required,
        "validation": validation or {},
        "sourceRef": source_ref,
    }
    if options:
        field["validation"]["options"] = options
    if formula_ref:
        field["formulaRef"] = formula_ref
    return field


def make_section(title, order, fields=None):
    return {
        "id": f"section_{order}",
        "title": title,
        "order": order,
        "fields": fields or [],
        "subsections": [],
    }


# =========================================================
# DETECTOR
# =========================================================

def detect_format(file_path):
    """Detect the form format of a file."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".docx":
        return "docx"
    if ext in (".xlsx", ".xlsm"):
        return "xlsx"
    if ext == ".pdf":
        return detect_pdf_format(file_path)
    return "unknown"


def detect_pdf_format(file_path):
    """Detect if a PDF is XFA or AcroForm."""
    try:
        import fitz
        doc = fitz.open(file_path)

        # Check for XFA streams in xref
        for i in range(doc.xref_length()):
            try:
                xml = doc.xref_stream(i)
                if xml and (b"<template" in xml or b"xfa:datasets" in xml.lower() if isinstance(xml, bytes) else False):
                    doc.close()
                    return "xfa"
            except Exception:
                continue

        # Check for XFA in AcroForm
        try:
            for i in range(doc.xref_length()):
                xref_str = doc.xref_object(i)
                if "/XFA" in xref_str:
                    doc.close()
                    return "xfa"
        except Exception:
            pass

        # Check for AcroForm widgets
        for page in doc:
            if list(page.widgets()):
                doc.close()
                return "acroform"

        doc.close()
        return "pdf_no_forms"
    except Exception as e:
        return f"error:{e}"


# =========================================================
# XFA EXTRACTOR (PyMuPDF — same pattern as xfa_extract.py)
# =========================================================

def extract_xfa(file_path):
    """Extract FormSpec from XFA PDF using PyMuPDF xref parsing."""
    import fitz

    doc = fitz.open(file_path)
    sections = []
    formulas = []
    declarations = []

    # Find XFA dataset streams
    xfa_xml = None
    for i in range(doc.xref_length()):
        try:
            stream = doc.xref_stream(i)
            if not stream:
                continue
            if b"<xfa:datasets" in stream or b"<template" in stream:
                xfa_xml = stream
                break
            # Also check for datasets namespace
            if b"xmlns:xfa" in stream:
                xfa_xml = stream
                break
        except Exception:
            continue

    fields = []
    if xfa_xml:
        try:
            from lxml import etree
            root = etree.fromstring(xfa_xml)
            fields = _parse_xfa_fields(root)
        except ImportError:
            # lxml not available — fallback to regex parsing
            fields = _parse_xfa_regex(xfa_xml)
        except Exception:
            fields = _parse_xfa_regex(xfa_xml)

    # Also extract widgets as fallback
    widget_fields = _extract_widgets(doc)
    doc.close()

    # Merge XFA fields with widget fields (XFA takes precedence)
    xfa_names = {f["name"] for f in fields}
    for wf in widget_fields:
        if wf["name"] not in xfa_names:
            fields.append(wf)

    # Group into single section (XFA structure is flat)
    if fields:
        sections.append(make_section("Formular XFA", 0, fields))

    return {
        "name": os.path.basename(file_path),
        "version": "",
        "programCode": "",
        "sourceFormat": "xfa",
        "sections": sections,
        "referenceData": {},
        "formulas": formulas,
        "declarations": declarations,
        "extractedFrom": file_path,
        "confidence": 0.85,
    }


def _parse_xfa_fields(root):
    """Parse XFA XML tree for form fields."""
    fields = []
    # Remove namespaces for easier parsing
    for elem in root.iter():
        if "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]

    # Look for field/draw/subform elements
    for field_elem in root.iter():
        tag = field_elem.tag
        if tag in ("field", "draw"):
            name = field_elem.get("name", "")
            if not name or name in ("pdfIdentifierCode", "templateDesigner"):
                continue

            # Determine type from UI child
            field_type = "text"
            ui = field_elem.find(".//ui")
            if ui is not None:
                for child in ui:
                    child_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    if child_tag == "numericEdit":
                        field_type = "number"
                    elif child_tag == "dateTimeEdit":
                        field_type = "date"
                    elif child_tag == "choiceList":
                        field_type = "dropdown"
                    elif child_tag == "checkButton":
                        field_type = "checkbox"
                    elif child_tag == "textEdit":
                        multiline = child.get("multiLine", "0")
                        field_type = "textarea" if multiline == "1" else "text"
                    elif child_tag == "signature":
                        field_type = "signature"

            # Get caption/label
            label = name
            caption = field_elem.find(".//caption")
            if caption is not None:
                value_elem = caption.find(".//value")
                if value_elem is not None:
                    text_elem = value_elem.find("text")
                    if text_elem is not None and text_elem.text:
                        label = text_elem.text.strip()

            # Get current value
            value = ""
            value_elem = field_elem.find("value")
            if value_elem is not None:
                for child in value_elem:
                    if child.text:
                        value = child.text.strip()
                        break

            # Get options for dropdowns
            options = []
            items = field_elem.find(".//items")
            if items is not None:
                for item in items:
                    if item.text:
                        options.append(item.text.strip())

            fields.append(make_field(
                name=name,
                label=label,
                field_type=field_type,
                source_ref=f"xfa:{name}",
                options=options if options else None,
            ))

    return fields


def _parse_xfa_regex(xfa_xml):
    """Fallback XFA parsing using regex when lxml is not available."""
    fields = []
    text = xfa_xml.decode("utf-8", errors="replace") if isinstance(xfa_xml, bytes) else xfa_xml

    # Find field elements
    for match in re.finditer(r'<field\s+name="([^"]+)"', text):
        name = match.group(1)
        if name in ("pdfIdentifierCode", "templateDesigner"):
            continue
        fields.append(make_field(name=name, label=name, source_ref=f"xfa:{name}"))

    return fields


def _extract_widgets(doc):
    """Extract AcroForm widgets from PDF pages."""
    fields = []
    for page_num, page in enumerate(doc):
        for widget in page.widgets():
            name = widget.field_name or f"field_p{page_num}_{len(fields)}"
            field_type = {
                0: "text",  # PDF_WIDGET_TYPE_TEXT
                2: "checkbox",
                3: "radio",
                4: "dropdown",
                5: "dropdown",
                7: "signature",
            }.get(widget.field_type, "text")

            options = list(widget.choice_values) if widget.choice_values else None

            fields.append(make_field(
                name=name,
                label=widget.field_label or name,
                field_type=field_type,
                required=bool(widget.field_flags & 2) if widget.field_flags else False,
                source_ref=f"acroform:{name}",
                options=options,
            ))

    return fields


# =========================================================
# ACROFORM EXTRACTOR
# =========================================================

def extract_acroform(file_path):
    """Extract FormSpec from AcroForm PDF using PyMuPDF widgets."""
    import fitz

    doc = fitz.open(file_path)
    sections = []

    for page_num, page in enumerate(doc):
        fields = []
        for widget in page.widgets():
            name = widget.field_name or f"field_{page_num}_{len(fields)}"
            field_type = {
                0: "text", 2: "checkbox", 3: "radio",
                4: "dropdown", 5: "dropdown", 7: "signature",
            }.get(widget.field_type, "text")

            options = list(widget.choice_values) if widget.choice_values else None

            fields.append(make_field(
                name=name,
                label=widget.field_label or name,
                field_type=field_type,
                required=bool(widget.field_flags & 2) if widget.field_flags else False,
                source_ref=f"acroform:{name}",
                options=options,
            ))

        if fields:
            sections.append(make_section(f"Pagina {page_num + 1}", page_num, fields))

    doc.close()

    return {
        "name": os.path.basename(file_path),
        "version": "",
        "programCode": "",
        "sourceFormat": "acroform",
        "sections": sections,
        "referenceData": {},
        "formulas": [],
        "declarations": [],
        "extractedFrom": file_path,
        "confidence": 0.9,
    }


# =========================================================
# DOCX EXTRACTOR
# =========================================================

PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

def extract_docx(file_path):
    """Extract FormSpec from DOCX template (placeholders + headings)."""
    from docx import Document

    doc = Document(file_path)
    sections = []
    current_section = None

    for para in doc.paragraphs:
        # Headings → new sections
        if para.style and para.style.name and para.style.name.startswith("Heading"):
            if current_section and current_section["fields"]:
                sections.append(current_section)
            current_section = make_section(para.text.strip(), len(sections))
            continue

        # Detect {{placeholders}}
        placeholders = PLACEHOLDER_RE.findall(para.text)
        for ph in placeholders:
            if current_section is None:
                current_section = make_section("General", 0)

            current_section["fields"].append(make_field(
                name=ph,
                label=ph.replace("_", " ").title(),
                field_type="text",
                source_ref=f"docx:{{{{{ph}}}}}",
            ))

    if current_section and current_section["fields"]:
        sections.append(current_section)

    # Extract from tables
    for table_idx, table in enumerate(doc.tables):
        fields = []
        for row_idx, row in enumerate(table.rows):
            for col_idx, cell in enumerate(row.cells):
                for ph in PLACEHOLDER_RE.findall(cell.text):
                    fields.append(make_field(
                        name=ph,
                        label=ph.replace("_", " ").title(),
                        field_type="text",
                        source_ref=f"docx:table[{table_idx}].row[{row_idx}].col[{col_idx}]",
                    ))
        if fields:
            sections.append(make_section(f"Tabel {table_idx + 1}", len(sections), fields))

    return {
        "name": os.path.basename(file_path),
        "version": "",
        "programCode": "",
        "sourceFormat": "docx",
        "sections": sections,
        "referenceData": {},
        "formulas": [],
        "declarations": [],
        "extractedFrom": file_path,
        "confidence": 0.85,
    }


# =========================================================
# XLSX EXTRACTOR
# =========================================================

def extract_xlsx(file_path):
    """Extract FormSpec from XLSX (editable cells + formulas)."""
    from openpyxl import load_workbook

    wb = load_workbook(file_path, data_only=False)
    sections = []
    formulas = []

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        fields = []

        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue

                cell_ref = f"{sheet_name}!{cell.coordinate}"

                # Formula cell
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    formula = {
                        "id": f"formula_{cell_ref}",
                        "fieldName": cell_ref,
                        "description": f"Formula din {cell_ref}",
                        "inputs": [],
                        "logic": cell.value,
                        "originalScript": cell.value,
                        "deterministic": True,
                    }
                    formulas.append(formula)
                    fields.append(make_field(
                        name=cell_ref,
                        label=cell_ref,
                        field_type="calculated",
                        source_ref=cell_ref,
                        formula_ref=formula["id"],
                    ))
                else:
                    # Check if cell is editable (not locked)
                    is_locked = cell.protection.locked if cell.protection else True
                    if not is_locked:
                        ft = "number" if isinstance(cell.value, (int, float)) else "text"
                        fields.append(make_field(
                            name=cell_ref,
                            label=str(cell.value)[:100] if cell.value else cell_ref,
                            field_type=ft,
                            source_ref=cell_ref,
                        ))

        if fields:
            sections.append(make_section(sheet_name, len(sections), fields))

    wb.close()

    return {
        "name": os.path.basename(file_path),
        "version": "",
        "programCode": "",
        "sourceFormat": "xlsx",
        "sections": sections,
        "referenceData": {},
        "formulas": formulas,
        "declarations": [],
        "extractedFrom": file_path,
        "confidence": 0.9,
    }


# =========================================================
# MAIN DISPATCHER
# =========================================================

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: formspec_extract.py <detect|extract> <file_path>"}))
        sys.exit(1)

    command = sys.argv[1]
    file_path = sys.argv[2]

    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    if command == "detect":
        fmt = detect_format(file_path)
        print(json.dumps({"format": fmt}))

    elif command == "extract":
        fmt = detect_format(file_path)
        extractors = {
            "xfa": extract_xfa,
            "acroform": extract_acroform,
            "docx": extract_docx,
            "xlsx": extract_xlsx,
        }

        if fmt not in extractors:
            print(json.dumps({"error": f"Unsupported format: {fmt}", "detectedFormat": fmt}))
            sys.exit(1)

        try:
            spec = extractors[fmt](file_path)
            # Count total fields
            total_fields = sum(len(s.get("fields", [])) for s in spec.get("sections", []))
            spec["totalFields"] = total_fields
            print(json.dumps(spec, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"error": str(e), "detectedFormat": fmt}))
            sys.exit(1)

    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
