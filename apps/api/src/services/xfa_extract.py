import fitz, json, sys, re, zlib
import xml.etree.ElementTree as ET


def extract_xfa_fields(pdf_path):
    doc = fitz.open(pdf_path)
    xref_len = doc.xref_length()

    # Corner case #1: Search ALL xref streams for datasets, not just first 200 chars
    datasets_xml = None
    for i in range(1, xref_len):
        try:
            stream = doc.xref_stream(i)
            if stream:
                text = stream.decode('utf-8', errors='ignore')
                # Search in first 1000 chars (some PDFs have long XML headers)
                if '<xfa:datasets' in text[:1000] or '<datasets' in text[:1000]:
                    datasets_xml = text
                    break
        except:
            pass

    if not datasets_xml:
        doc.close()
        return []

    # Corner case #2: Preserve non-xfa namespaces, only clean xfa prefix
    # Remove all namespace declarations to simplify parsing
    clean_xml = re.sub(r'\sxmlns(?::[a-zA-Z0-9]+)?="[^"]*"', '', datasets_xml)
    # Remove ALL namespace prefixes (xfa:, dd:, tpl:, xdp:, etc.)
    clean_xml = re.sub(r'<(/?)([a-zA-Z0-9]+):', r'<\1', clean_xml)

    try:
        root = ET.fromstring(clean_xml)
    except ET.ParseError:
        # Try to repair common XML issues
        clean_xml = clean_xml.replace('&', '&amp;').replace('&amp;amp;', '&amp;')
        try:
            root = ET.fromstring(clean_xml)
        except:
            doc.close()
            return []

    # Corner case #3: Find the right <data> element (skip metadata ones)
    data_el = None
    for candidate in root.iter('data'):
        children = list(candidate)
        if len(children) > 0:
            # Pick the data element that has the most children (actual form data)
            if data_el is None or len(children) > len(list(data_el)):
                data_el = candidate

    if data_el is None or len(list(data_el)) == 0:
        doc.close()
        return []

    fields = []
    skip_names = {
        'pdfIdentifierCode', 'pdfMajorVersion', 'pdfMinorVersion',
        'pdfBuildNumber', 'pdfVersion', 'textVersion', 'testinternafir',
        'instanceManager', '_', '#text'
    }
    # Corner case #7: Extended skip patterns for system/metadata fields
    skip_patterns = ['instanceManager', 'templateDesigner', '_default']

    def should_skip(name):
        if name in skip_names:
            return True
        if name.startswith('_') or name.startswith('#'):
            return True
        for pat in skip_patterns:
            if pat.lower() in name.lower():
                return True
        return False

    def guess_type(name, value=""):
        nl = name.lower()
        vl = (value or "").lower().strip()
        if any(k in nl for k in ['pret', 'valoare', 'total', 'suma', 'cantitate', 'procent', 'scor', 'numar', 'nr_']):
            return 'number'
        if any(k in nl for k in ['descriere', 'detaliere', 'observatii', 'justificar', 'obiectiv']):
            return 'textarea'
        if any(k in nl for k in ['check', 'categ', 'tip_', 'forma_']):
            return 'select'
        if vl in ('da', 'nu', 'yes', 'no', '0', '1') and len(vl) <= 3:
            return 'select'
        if any(k in nl for k in ['semnatura', 'signature']):
            return 'signature'
        if any(k in nl for k in ['data', 'date']):
            return 'date'
        return 'text'

    def camel_to_label(name):
        result = re.sub(r'([A-Z])', r' \1', name).strip()
        return re.sub(r'_', ' ', result)

    def extract_value(el):
        """Corner case #5: Handle <value><text>content</text></value> wrappers"""
        children = list(el)
        if len(children) == 0:
            return (el.text or "").strip()

        # Check for value wrapper pattern: <field><value><text>content</text></value></field>
        for child in children:
            tag = child.tag.lower()
            if tag in ('value', 'rawvalue', 'text', 'string', 'integer', 'float', 'decimal', 'boolean'):
                # This is a value wrapper — extract text from it or its children
                if child.text and child.text.strip():
                    return child.text.strip()
                for grandchild in child:
                    if grandchild.text and grandchild.text.strip():
                        return grandchild.text.strip()

        return (el.text or "").strip()

    def is_leaf_field(el):
        """Corner case #5: Determine if an element is a data field (not a group).
        Fields may have value wrapper children like <value>, <text>, etc."""
        children = list(el)
        if len(children) == 0:
            return True

        # If all children are value wrappers, this is still a leaf field
        wrapper_tags = {'value', 'rawvalue', 'text', 'string', 'integer',
                       'float', 'decimal', 'boolean', 'date', 'time', 'dateTime',
                       'exdata', 'image'}
        child_tags = {ch.tag.lower() for ch in children}
        if child_tags.issubset(wrapper_tags):
            return True

        return False

    def extract_recursive(parent_el, parent_path, group_name):
        children = list(parent_el)
        if not children:
            return

        tag_counts = {}
        for ch in children:
            tag_counts[ch.tag] = tag_counts.get(ch.tag, 0) + 1

        tag_indices = {}

        for ch in children:
            tag = ch.tag
            if should_skip(tag):
                continue

            is_repeating = tag_counts[tag] > 1

            if is_repeating:
                idx = tag_indices.get(tag, 0)
                tag_indices[tag] = idx + 1

                # Process leaf children of this repeating element
                for leaf in ch:
                    if should_skip(leaf.tag):
                        continue
                    if is_leaf_field(leaf):
                        name = leaf.tag
                        key = f"{parent_path}.{tag}[{idx}].{name}"
                        value = extract_value(leaf)
                        fields.append({
                            "key": key,
                            "label": f"{tag} #{idx+1} — {camel_to_label(name)}",
                            "currentValue": value,
                            "fieldType": guess_type(name, value),
                            "group": group_name,
                            "isRepeating": True,
                            "rowIndex": idx
                        })
                    else:
                        # Nested group inside repeating element
                        extract_recursive(leaf, f"{parent_path}.{tag}[{idx}]", group_name)

            elif is_leaf_field(ch):
                # Simple leaf field
                name = tag
                key = f"{parent_path}.{name}" if parent_path else name
                value = extract_value(ch)
                fields.append({
                    "key": key,
                    "label": camel_to_label(name),
                    "currentValue": value,
                    "fieldType": guess_type(name, value),
                    "group": group_name or "general",
                    "isRepeating": False,
                    "rowIndex": None
                })
            else:
                # Container/group — recurse
                new_group = tag if parent_path == "" else group_name
                new_path = f"{parent_path}.{tag}" if parent_path else tag
                extract_recursive(ch, new_path, new_group)

    # Corner case #4: Process ALL top-level children of <data>, not just the first
    for form_root in data_el:
        if should_skip(form_root.tag):
            continue
        extract_recursive(form_root, "", form_root.tag if len(list(data_el)) > 1 else "")

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
                if '<xfa:datasets' in text[:1000] or '<datasets' in text[:1000]:
                    ds_xref = i
                    ds_xml = text
                    break
        except:
            pass

    if not ds_xref:
        doc.save(output_path)
        doc.close()
        return {"filled_count": 0, "error": "No datasets stream"}

    clean_xml = re.sub(r'\sxmlns(?::[a-zA-Z0-9]+)?="[^"]*"', '', ds_xml)
    clean_xml = re.sub(r'<(/?)([a-zA-Z0-9]+):', r'<\1', clean_xml)
    root = ET.fromstring(clean_xml)

    data_el = None
    for candidate in root.iter('data'):
        children = list(candidate)
        if len(children) > 0:
            if data_el is None or len(children) > len(list(data_el)):
                data_el = candidate

    if not data_el:
        doc.save(output_path)
        doc.close()
        return {"filled_count": 0, "error": "No data element"}

    # For fill, we need to find the right form root
    # If key starts with a top-level child name, navigate from data_el
    # Otherwise navigate from first child (backward compat)
    top_level_tags = {ch.tag for ch in data_el}

    filled = 0
    failed_keys = []

    # Build a flat map of all fillable paths for fuzzy matching
    all_xfa_paths = {}
    def index_paths(el, prefix=""):
        for ch in el:
            tag = ch.tag
            path = f"{prefix}.{tag}" if prefix else tag
            sub = list(ch)
            if len(sub) == 0 or all(s.tag.lower() in ('value', 'rawvalue', 'text', 'string', 'integer', 'float', 'decimal', 'boolean') for s in sub):
                all_xfa_paths[path.lower()] = (el if not prefix else None, path)
                # Also index by last segment for fuzzy matching
                all_xfa_paths[tag.lower()] = (el if not prefix else None, path)
            else:
                # Check for repeating
                tag_counts = {}
                for s in sub:
                    tag_counts[s.tag] = tag_counts.get(s.tag, 0) + 1
                idx_map = {}
                for s in sub:
                    if tag_counts[s.tag] > 1:
                        idx = idx_map.get(s.tag, 0)
                        idx_map[s.tag] = idx + 1
                        index_paths(s, f"{path}[{idx}]")
                    else:
                        index_paths(s, path)
    for form_root in data_el:
        index_paths(form_root, form_root.tag if len(list(data_el)) > 1 else "")

    def set_by_path(start_el, path_str, value):
        nonlocal filled
        parts = []
        for part in re.split(r'\.(?![^\[]*\])', path_str):
            parts.append(part)

        current = start_el
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
        # Handle value wrappers
        value_child = current.find('value')
        if value_child is not None:
            text_child = value_child.find('text')
            if text_child is not None:
                text_child.text = safe_value
            else:
                value_child.text = safe_value
        else:
            current.text = safe_value
        filled += 1
        return True

    for key_path, value in data.items():
        if not value or not str(value).strip():
            continue

        success = False
        # Try to resolve starting point: data_el or its first child
        first_part = key_path.split('.')[0].split('[')[0]
        if first_part in top_level_tags:
            success = set_by_path(data_el, key_path, value)
        else:
            # Backward compat: try from first child
            if len(list(data_el)) > 0:
                success = set_by_path(list(data_el)[0], key_path, value)

        # Fuzzy fallback: try matching by last key segment
        if not success:
            last_segment = key_path.rsplit('.', 1)[-1].split('[')[0].lower()
            if last_segment in all_xfa_paths:
                _, resolved_path = all_xfa_paths[last_segment]
                if first_part in top_level_tags:
                    success = set_by_path(data_el, resolved_path, value)
                elif len(list(data_el)) > 0:
                    success = set_by_path(list(data_el)[0], resolved_path, value)

        if not success:
            failed_keys.append(key_path)

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
    return {"filled_count": filled, "failed_keys": failed_keys, "total_attempted": len([k for k, v in data.items() if v and str(v).strip()])}


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
