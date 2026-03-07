import fitz, json, sys, re
import xml.etree.ElementTree as ET


def extract_xfa_fields(pdf_path):
    doc = fitz.open(pdf_path)
    xref_len = doc.xref_length()

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

    clean_xml = re.sub(r'\sxmlns[^"]*"[^"]*"', '', datasets_xml)
    clean_xml = re.sub(r'xfa:', '', clean_xml)
    root = ET.fromstring(clean_xml)

    data_el = root.find('.//data')
    if data_el is None or len(data_el) == 0:
        doc.close()
        return []

    form_root = data_el[0]

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

                for nested in ch:
                    if len(list(nested)) > 0:
                        extract(nested, f"{parent_path}.{tag}[{idx}]", group_name)

            elif sub_children:
                new_group = tag if parent_path == "" else group_name
                new_path = f"{parent_path}.{tag}" if parent_path else tag
                extract(ch, new_path, new_group)

            else:
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
    """Fill XFA fields using indexed path.
    data = { "general.NumeSolicitant": "SC X SRL", "B1.VanzariFizicePrevizionate[0].Categ": "Grau" }
    """
    doc = fitz.open(input_path)
    xref_len = doc.xref_length()

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

    clean_xml = re.sub(r'\sxmlns[^"]*"[^"]*"', '', ds_xml)
    clean_xml = re.sub(r'xfa:', '', clean_xml)
    root = ET.fromstring(clean_xml)

    data_el = root.find('.//data')
    form_root = data_el[0]

    filled = 0

    def set_by_path(root_el, path_str, value):
        nonlocal filled
        parts = []
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
    action = sys.argv[1]
    if action == "extract":
        fields = extract_xfa_fields(sys.argv[2])
        print(json.dumps(fields, ensure_ascii=False))
    elif action == "fill":
        with open(sys.argv[4], 'r', encoding='utf-8') as f:
            data = json.load(f)
        result = fill_xfa_pdf(sys.argv[2], sys.argv[3], data)
        print(json.dumps(result))
