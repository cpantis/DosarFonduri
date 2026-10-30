# DOCUMENT_FLOW_AUDIT.md
# DosarFonduri v2 — Verificare completă flux documente
# Keywords de audit pentru Claude Code

---

## SCOPUL ACESTUI FIȘIER

Acest document descrie **întregul ciclu de viață al documentelor** în DosarFonduri v2.
Claude Code trebuie să verifice că fiecare etapă este implementată corect,
că datele trec curat dintr-o etapă în alta, și că nu există gap-uri în pipeline.

**Cum se folosește:** Claude Code citește acest fișier și verifică implementarea
fiecărei etape, raportând ce există, ce lipsește, și ce are probleme.

---

## CELE 7 ETAPE ALE FLUXULUI

```
UPLOAD → PROCESARE → EXTRAGERE → VALIDARE → SALVARE → RANDARE → CREARE
  │         │           │           │          │          │          │
  │         │           │           │          │          │          └─ Documente finale (DOCX/PDF)
  │         │           │           │          │          └─ UI display (elemente, tabele, status)
  │         │           │           │          └─ PostgreSQL + R2 + Redis
  │         │           │           └─ Contra reguli ghid + anexe reference
  │         │           └─ Date structurate din document
  │         └─ OCR, parsare, clasificare
  └─ Fișierul brut de la user
```

---

## CLASIFICAREA DOCUMENTELOR

Verifică că sistemul distinge **5 tipuri fundamentale** de documente,
fiecare cu un pipeline diferit:

### TIP 1: GHID DE FINANȚARE
- **Upload:** PDF (40-100+ pagini)
- **Procesare:** OCR hibrid (PyMuPDF text nativ + Claude Vision pe paginile scanate)
- **Extragere:** Reguli fixe (Sonnet) + Reguli interpretate (Opus+ET) + Referințe la anexe
- **Validare:** Confidence scoring, needs_review flag
- **Salvare:** `guides` + `guide_rules` + referințe spre `guide_reference_tables`
- **Randare:** Lista reguli în UI cu status review
- **Creare:** NU generează output — alimentează celelalte fluxuri

### TIP 2: ANEXE GHID (date de referință)
- **Upload:** PDF, DOCX, XLSX (tabele structurate)
- **Procesare:** OCR + parsare tabelară
- **Extragere:** Tabele structurate → rows/columns JSON
- **Validare:** Verificare structură (nr coloane, tipuri date), consultant review
- **Salvare:** `guide_reference_tables` (JSONB cu rows_data)
- **Randare:** Tabelele apar ca lookup în validarea elementelor
- **Creare:** NU generează output — servesc ca date de referință

### TIP 3: DOCUMENTE CLIENT (surse de date)
- **Upload:** PDF (certificat constatator, bilanțuri, contracte arendă, oferte preț, etc.)
- **Procesare:** OCR hibrid + clasificare document (Haiku)
- **Extragere:** Date structurate specifice tipului de document
- **Validare:** Cross-check cu `element_definitions`, cu alte surse (ONRC, ANAF)
- **Salvare:** `documents` (metadata) + R2 (fișier) + `project_elements` (valorile extrase)
- **Randare:** Valorile apar în "Elemente din Ghid", badge-ul "Document" ca sursă
- **Creare:** NU generează output — alimentează elementele proiectului

### TIP 4: TEMPLATE-URI CABINET (formulare de completat)
- **Upload:** DOCX, PDF, XLSX uploadate de consultant ca template-uri
- **Procesare:** Parsare câmpuri `{{placeholder}}` (python-docx / openpyxl / PyMuPDF)
- **Extragere:** Lista de placeholders + mapping la `element_definitions`
- **Validare:** Verificare că toate placeholder-urile au corespondent în element_definitions
- **Salvare:** `templates` (metadata + placeholder map) + R2 (fișierul template)
- **Randare:** Lista template-uri în "Scriere proiect" cu % completare
- **Creare:** Neemia folosește template-ul pentru a genera documentul final

### TIP 5: DOCUMENTE GENERATE (output final)
- **Upload:** NU se uploadează — se creează de Neemia
- **Procesare:** Neemia FILL (formulare fixe) sau COMPOSE (documente libere)
- **Extragere:** N/A
- **Validare:** Post-generare: verificare completitudine, verificare calcule
- **Salvare:** `generated_documents` + R2 (fișierul generat) + versioning
- **Randare:** Preview în UI + download
- **Creare:** DOCX/PDF final, cu stil cabinet (logo doar pe documente de lucru)

---

## ETAPA 1: UPLOAD
**Keywords de verificare:** `multer`, `R2 upload`, `file validation`, `mime type`, `size limit`

### Verifică existența:
- [ ] **Endpoint upload** — `POST /api/documents/upload`
- [ ] **Validare fișier la intrare:**
  - Mime types acceptate: `application/pdf`, `.docx`, `.xlsx`, `.xls`, `.doc`
  - Dimensiune maximă: configurabilă per tip (ex: ghid max 50MB, doc client max 20MB)
  - Sanitizare nume fișier (fără caractere speciale conform cerințelor AFIR)
- [ ] **Clasificare context upload:**
  - Upload în context ghid → TIP 1 sau TIP 2
  - Upload în context proiect → TIP 3
  - Upload în context template cabinet → TIP 4
  - Parametru `upload_context` obligatoriu: `guide`, `guide_annex`, `client_document`, `template`
- [ ] **Stocare imediată în R2:**
  - Path structurat: `/{cabinet_id}/{context}/{uuid}.{ext}`
  - Metadata R2: `content-type`, `original-filename`, `upload-context`, `uploaded-by`
- [ ] **Creare înregistrare DB:**
  - Tabel `documents`: id, cabinet_id, project_id (nullable), guide_id (nullable), 
    original_name, storage_path, mime_type, size_bytes, upload_context, 
    processing_status: 'pending', uploaded_by, created_at
- [ ] **Dispatch BullMQ job:**
  - Job `process-document` cu document_id
  - Prioritate: ghid > template > document client (ghidul deblochează restul)
- [ ] **SSE notification** → frontend primește status "Document uploadat, procesare în curs..."

### Edge cases de verificat:
- [ ] Upload duplicat (același fișier, hash identic) → warning, nu blocare
- [ ] Upload fișier corupt → eroare clară, nu crash
- [ ] Upload .doc (legacy) → conversie automată la .docx înainte de procesare
- [ ] Upload simultan de mai multe fișiere → procesare paralelă

---

## ETAPA 2: PROCESARE
**Keywords de verificare:** `PyMuPDF`, `Claude Vision`, `OCR`, `Haiku`, `clasificare`, `BullMQ worker`

### Verifică existența:
- [ ] **OCR hibrid în ai-worker:**
  - PyMuPDF extrage text nativ per pagină (gratuit, <100ms)
  - Detectare pagini fără text (scanate) → `has_native_text = False`
  - Doar paginile scanate merg la Claude Vision (cost optimization)
  - Output: array de `{page_number, text, is_scanned, confidence}`
- [ ] **Clasificare document (Haiku):**
  - Input: primele 2-3 pagini text
  - Output: `document_type` enum din lista cunoscută:
    ```
    guide, guide_annex_table, guide_annex_form,
    certificat_constatator, bilant_anaf, contract_arenda, 
    oferta_pret, registru_imobilizari, declaratie_expert_contabil,
    document_mediu, extras_cont, certificat_fiscal,
    memoriu_template, cerere_finantare_template, 
    anexa_b_template, anexa_c_template,
    other
    ```
  - Cost: ~$0.001 per clasificare
- [ ] **Parsare structurală (depinde de tip):**
  - PDF tabular (anexe) → extragere tabele cu structură rows/columns
  - DOCX template → extragere `{{placeholder}}` patterns
  - XLSX → parsare sheets, headers, data ranges
  - PDF formular → detectare câmpuri de completat (form fields)
- [ ] **Update status document:**
  - `processing_status`: 'pending' → 'processing' → 'processed' / 'failed'
  - `processing_result`: JSONB cu metadata extrasă
  - `page_count`, `has_tables`, `has_forms`, `language`
- [ ] **Anthropic Files API:**
  - Upload file_id pentru ghiduri (refolosit în apelurile Solomon/Neemia)
  - Cache file_id în Redis cu TTL 24h
- [ ] **SSE notification** → "Procesare completă. X pagini, Y tabele detectate."

### Performanță de verificat:
- [ ] Document 10 pagini text nativ: < 1s
- [ ] Document 10 pagini scanat: < 8s
- [ ] Parsare template DOCX: < 3s
- [ ] Clasificare (Haiku): < 500ms

---

## ETAPA 3: EXTRAGERE
**Keywords de verificare:** `Sonnet`, `Opus`, `Extended Thinking`, `structured extraction`, `Haiku`

### Verifică existența per tip document:

#### 3A. Extragere din GHID:
- [ ] **Reguli fixe (Sonnet, un singur apel):**
  - Input: textul complet al ghidului (via Files API)
  - Output structurat JSON: array de reguli cu `rule_code`, `title`, `description`,
    `category`, `evaluation_mode`, `required_elements`, `referenced_annexes`
  - ~25-30 reguli per ghid, ~12s, ~$0.04
- [ ] **Reguli interpretate (Opus + Extended Thinking):**
  - Input: textul ghidului + focus pe secțiuni complexe
  - `budget_tokens`: 8000-12000 pentru Extended Thinking
  - Output: reguli cu `logic` (arbore decizional JSONB), `confidence_score`
  - Când `confidence < 0.85` → `needs_review = true`
  - ~35s, ~$0.25
- [ ] **Extragere referințe la anexe:**
  - Detectare mențiuni "Anexa 3", "Anexa 4", "Anexa 6" etc. în textul regulilor
  - Populare `referenced_annexes` pe fiecare regulă
  - Generare lista de anexe necesare (pentru a cere upload-ul lor)
- [ ] **Extragere element_definitions:**
  - Din reguli + din cererea de finanțare → lista de elemente necesare
  - Fiecare element cu: `element_key`, `display_name`, `data_type`, `category`,
    `source_priority`, `validation_rules`, `used_by_rules`, `used_in_templates`

#### 3B. Extragere din ANEXE (reference tables):
- [ ] **Tabele structurate (Haiku sau Sonnet):**
  - Input: textul/imaginea tabelului
  - Output: `columns_schema` + `rows_data` ca JSONB
  - Detectare `data_type`: `lookup_range`, `lookup_exact`, `list`, `matrix`
  - Detectare `lookup_key` (coloana pe care se face lookup)
  - Extragere excepții textuale (ex: "Pentru 10-18 ha se acceptă 80 CP")
- [ ] **Verificare extragere:** nr de rânduri/coloane matches documentul original

#### 3C. Extragere din DOCUMENTE CLIENT:
- [ ] **Certificat constatator (Haiku, structurat):**
  - Extrage: denumire, CUI, nr înmatriculare, CAEN principal, CAEN-uri secundare,
    adresă sediu, asociați/administratori, data înregistrare, capital social
- [ ] **Bilanț ANAF (Haiku, structurat):**
  - Extrage: cifra afaceri, profit net, active totale, datorii, nr angajați
  - Per an fiscal
- [ ] **Contracte arendă (Sonnet):**
  - Extrage: UAT-uri, suprafețe per UAT, durată contract, arendator
  - Cross-check: suma suprafețelor vs. suprafața declarată
- [ ] **Oferte de preț (Haiku):**
  - Extrage: furnizor, utilaj, specificații tehnice, preț unitar, preț total, valabilitate
- [ ] **Registru imobilizări (Haiku):**
  - Extrage: lista echipamente existente, an achiziție, valoare, stare
  - Relevant pentru: tractoare existente, verificare Anexa 3 (exclus cele >8 ani)

#### 3D. Extragere din TEMPLATE-URI:
- [ ] **DOCX placeholders:**
  - Regex: `\{\{[a-zA-Z_]+\}\}` în text + tabele + headers/footers
  - Output: lista de placeholder-uri cu poziția în document
- [ ] **Mapping placeholders → element_definitions:**
  - Automat (fuzzy match pe key) + manual review de consultant
  - Placeholder-uri nemapate → warning în UI

### Edge cases de verificat:
- [ ] Ghid fără text nativ (full scanat) → OCR complet înainte de extragere
- [ ] Anexă cu tabele pe mai multe pagini → reconstrucție tabel complet
- [ ] Document client în altă limbă → detectare + warning
- [ ] Placeholder duplicat în template → warning, nu eroare

---

## ETAPA 4: VALIDARE
**Keywords de verificare:** `rule_evaluations`, `cross-check`, `lookup`, `guide_reference_tables`, `element validation`

### Verifică existența:

#### 4A. Validare element individual:
- [ ] **Validare tip de date:**
  - number: este numeric, în range-ul acceptat (min/max din element_definition)
  - text: lungime acceptabilă, fără caractere invalide
  - enum: valoare din lista permisă
  - date: format valid, în range logic (nu în viitor pentru data înregistrare)
  - document_ref: documentul referit există și e procesat
- [ ] **Validare contra reference_tables (lookup):**
  - Element cu `lookup_table_id` setat → execută lookup automat
  - Exemplu: suprafata 270.70 ha → Anexa 3, Tabel 1 → interval 201-500
  - Salvează `lookup_result` pe `project_elements.validation_details`
- [ ] **Validare cross-element:**
  - Sumă suprafețe din contracte arendă == suprafata_exploatatie declarată
  - Putere tractor propus <= putere max din lookup Anexa 3
  - Putere cumulată (existente + propus) <= putere max cumulată din lookup
  - Profit mediu 3 ani <= 4× valoare sprijin solicitat
- [ ] **Validare status per element:**
  - `pending` → nu are valoare
  - `valid` → toate validările trec
  - `warning` → valoare există dar necesită atenție (ex: specificație no-till neverificabilă automat)
  - `invalid` → regulă încălcată
  - Salvare în `project_elements.validation_status` + `validation_details`

#### 4B. Validare reguli (rule_evaluations):
- [ ] **Evaluare reguli fixe (automat):**
  - Toate `required_elements` populate → evaluare automată
  - Rezultat: `pass` / `fail` / `insufficient_data`
  - Salvare snapshot input_elements la momentul evaluării
- [ ] **Evaluare reguli interpretate (semi-automat):**
  - Arbore decizional executat programatic din `logic` JSONB
  - Când nu se poate evalua automat → `needs_review`
  - Solomon poate asista consultantul cu explicații
- [ ] **Evaluare criterii selecție (calcul punctaj):**
  - Fiecare criteriu CS cu punctajul calculat
  - Total punctaj live, recalculat la fiecare modificare de element
  - Comparare cu pragul de calitate lunar
- [ ] **Cascade update:**
  - Modificare element → re-evaluare tuturor regulilor care depind de el
  - Re-evaluare → update punctaj → SSE push → UI update live
- [ ] **SSE notification** → "Element validat. Punctaj actualizat: 72p"

#### 4C. Validare documente generate:
- [ ] **Post-generare verificare completitudine:**
  - Toate placeholder-urile au fost înlocuite (nu rămân `{{...}}` în output)
  - Toate tabelele au datele complete (nu celule goale unde nu ar trebui)
  - Calculele din tabele sunt corecte (totale, procente)
- [ ] **Verificare conformitate format:**
  - Formulare AFIR: structura nu a fost modificată
  - Documente libere: format A4, margini standard, font lizibil

---

## ETAPA 5: SALVARE
**Keywords de verificare:** `Drizzle`, `PostgreSQL`, `JSONB`, `R2`, `Redis`, `audit_log`, `versioning`

### Verifică existența:

#### 5A. PostgreSQL (date structurate):
- [ ] **Tabel `guides`:** id, cabinet_id, name, session_year, program, status, file_url, page_count
- [ ] **Tabel `guide_rules`:** id, guide_id, rule_code, rule_type, category, title, description,
      logic (JSONB), evaluation_mode, confidence, needs_review, referenced_annexes, 
      required_elements, source_page
- [ ] **Tabel `guide_reference_tables`:** id, guide_id, annex_code, annex_name, table_code,
      table_name, data_type, columns_schema (JSONB), rows_data (JSONB), lookup_key,
      exceptions (JSONB), source_document_id, extracted_by, verified_by, verified_at
- [ ] **Tabel `element_definitions`:** id, guide_id, element_key, display_name, category,
      data_type, unit, enum_values (JSONB), source_priority, validation_rules (JSONB),
      used_by_rules, used_in_templates, lookup_table_id, is_derived, derivation_formula,
      collection_order, required, help_text
- [ ] **Tabel `project_elements`:** id, project_id, element_def_id, value (JSONB), source,
      source_document_id, confidence, verified_by, verified_at, validation_status,
      validation_details (JSONB), created_at, updated_at
- [ ] **Tabel `rule_evaluations`:** id, project_id, rule_id, status, evaluated_at,
      input_elements (JSONB), lookup_result (JSONB), reasoning, overridden_by
- [ ] **Tabel `documents`:** id, cabinet_id, project_id, guide_id, original_name, storage_path,
      mime_type, size_bytes, upload_context, document_type, processing_status,
      processing_result (JSONB), page_count, uploaded_by, created_at
- [ ] **Tabel `templates`:** id, cabinet_id, guide_id, name, template_type, storage_path,
      placeholders (JSONB), placeholder_mapping (JSONB), uploaded_by
- [ ] **Tabel `generated_documents`:** id, project_id, template_id, generation_mode,
      storage_path, version, status, generated_by, generated_at
- [ ] **Tabel `element_audit_log`:** id, project_element_id, old_value, new_value, changed_by,
      change_source, changed_at
- [ ] **Tabel `cabinet_document_style`:** pe tabelul `cabinets` ca JSONB:
      primary_color, accent_color, font_family, logo_url, footer_text,
      highlight_color, warning_color, logo_on_work_docs, logo_on_final_docs

#### 5B. Cloudflare R2 (fișiere):
- [ ] **Structură path:**
  - Documente uploadate: `/{cabinet_id}/uploads/{document_id}.{ext}`
  - Template-uri: `/{cabinet_id}/templates/{template_id}.{ext}`
  - Documente generate: `/{cabinet_id}/generated/{project_id}/{gen_doc_id}_v{version}.{ext}`
  - Logo-uri cabinet: `/{cabinet_id}/branding/logo.{ext}`
- [ ] **Metadata R2** pe fiecare obiect
- [ ] **Presigned URLs** pentru download (expirare 1h)

#### 5C. Redis (cache + queue):
- [ ] **Cache:**
  - Date ONRC per CUI → TTL 7 zile
  - Ghiduri procesate + reguli → TTL 30 zile
  - Anthropic File IDs → TTL 24h
  - Contexte agenți per proiect → TTL 1h
- [ ] **BullMQ jobs:**
  - Queue `document-processing` (upload → procesare → extragere)
  - Queue `validation` (element change → re-evaluate rules)
  - Queue `generation` (Neemia document generation)
- [ ] **SSE pub/sub:**
  - Channel per project: `project:{id}:updates`
  - Evenimente: element_updated, rule_evaluated, score_changed, document_generated

#### 5D. Audit & Versioning:
- [ ] Fiecare modificare de `project_elements` → înregistrare în `element_audit_log`
- [ ] Fiecare document generat → versiune incrementală (v1, v2, v3...)
- [ ] Istoric complet vizibil în UI (butonul "Istoric" pe fiecare element)

---

## ETAPA 6: RANDARE
**Keywords de verificare:** `SSE`, `TanStack Query`, `Zustand`, `real-time`, `UI components`

### Verifică existența:

#### 6A. Pagina "Elemente din Ghid":
- [ ] **Categorii cu progress bar:** Beneficiar, Exploatație, Investiție, Localizare, Financiar, Documente
- [ ] **Element cards cu:**
  - StatusDot (verde/galben/gri/roșu)
  - Valoare curentă sau help text dacă pending
  - SourceBadge (ONRC, ANAF, Solomon, Document, Calculat, Manual)
  - Validation message preview
- [ ] **Element expandat cu:**
  - Lookup panel (date din guide_reference_tables cu highlight pe rândul activ)
  - Cross-reference panel (elemente dependente)
  - Tag-uri reguli (roșu) + template-uri (verde)
  - Butoane: Editează, Istoric, Completează cu Solomon
- [ ] **Scoring panel lateral:**
  - Criterii selecție cu punctaj per criteriu
  - Total live, prag de calitate, status depășire
- [ ] **Update real-time via SSE:**
  - Modificare element → UI se actualizează fără refresh
  - Recalculare punctaj → animație pe scor

#### 6B. Pagina "Pre-eligibilitate":
- [ ] Lista reguli fixe cu status DA/NU/Necunoscut
- [ ] Go/no-go vizual (dacă una e NU → proiect blocat)
- [ ] Link spre elementul care cauzează problema

#### 6C. Pagina "Scriere proiect":
- [ ] Lista template-uri cu % completare (câte placeholder-uri au valori)
- [ ] Preview document (rendered, nu raw)
- [ ] Buton "Generează cu Neemia" per template
- [ ] Status generare: draft → review → final
- [ ] Download document generat (DOCX + PDF)

#### 6D. Chat Solomon:
- [ ] Mesajele Solomon afișează validări inline
  (ex: "270,70 ha → ✅ interval 201-500, putere max 400 CP")
- [ ] Elementele colectate din chat apar imediat în "Elemente din Ghid"
- [ ] Upload document din chat → procesare + extragere + populare elemente
- [ ] Punctaj live vizibil în chat sidebar

---

## ETAPA 7: CREARE (Neemia)
**Keywords de verificare:** `python-docx`, `openpyxl`, `PyMuPDF`, `Neemia`, `FILL mode`, `COMPOSE mode`, `cabinet_document_style`

### Verifică existența:

#### 7A. Modul FILL (formulare fixe AFIR):
- [ ] **Input:** template original (DOCX/PDF) + project_elements
- [ ] **Proces:**
  - Parsare template → identificare câmpuri/placeholders
  - Mapping placeholder → element_definition → project_element.value
  - Inserare valori în câmpurile corecte
  - NU modifică structura documentului
  - NU adaugă/șterge rânduri în tabele
  - NU schimbă formatarea
- [ ] **Output:** Document completat, identic structural cu originalul
- [ ] **Validare post-generare:** niciun placeholder rămas necompletat

#### 7B. Modul COMPOSE (documente libere):
- [ ] **Input:** template cabinet (cu {{placeholders}}) + project_elements + 
      guide_reference_tables + cabinet_document_style + guide_rules
- [ ] **Proces:**
  - Înlocuire placeholders text cu valori din project_elements
  - Construire tabele dinamice:
    - Tabele de lookup (Anexa 3 cu highlight pe rândul activ)
    - Tabele plan cultură (cu totaluri calculate)
    - Tabele utilaje (cu specificații și valori)
    - Tabele financiare (cu calcule automate)
    - Tabele UAT/ANC (cu clasificare și majorări)
  - Generare calcule demonstrative sub tabele
    (ex: "270,70 ha × 2 CP/ha = 541,40 CP → CONFORM")
  - Generare text narativ argumentativ (Solomon-assisted)
  - Aplicare stil cabinet (culori, font, logo doar pe doc de lucru)
- [ ] **Output:** Document profesional complet, formatat
- [ ] **Validare post-generare:** completitudine + calcule corecte

#### 7C. Neemia DOCX Kit (skill de formatare):
- [ ] **Token-uri design (din cabinet_document_style):**
  - `primary_color` → header-e tabele, titluri
  - `accent_color` → highlight rând activ, badge-uri CONFORM
  - `font_family` → tot textul din document
  - `highlight_color` → rândul activ din lookup tables
  - `warning_color` → badge-uri atenție
- [ ] **Helper functions reutilizabile:**
  - `header_cell(text, width, style)` → celulă header colorată
  - `data_cell(text, width, opts)` → celulă date cu opțiuni
  - `number_cell(value, width, opts)` → formatare numerică ro-RO
  - `currency_cell(value, width, currency)` → formatare EUR/RON
  - `percent_cell(value, width)` → formatare procent
  - `status_cell(status, width)` → CONFORM/NECONFORM cu culoare
  - `build_lookup_table(reference_table, active_value)` → tabel cu highlight
  - `build_plan_cultura(plan, years)` → tabel plan cultură cu totaluri
  - `build_financial_table(elements)` → plan financiar
- [ ] **Distincție document de lucru vs. depunere:**
  - `generation_context`: 'work' sau 'submission'
  - Logo cabinet: doar pe 'work'
  - Footer cabinet: doar pe 'work'

#### 7D. Versioning documente generate:
- [ ] Fiecare generare → versiune nouă (nu suprascriere)
- [ ] Comparare versiuni vizibilă în UI
- [ ] Ultima versiune = versiunea activă
- [ ] Download orice versiune anterioară

---

## VERIFICĂRI TRANSVERSALE (cross-cutting)

### Securitate:
- [ ] Fișiere uploadate validate server-side (nu doar client)
- [ ] Fișiere accesibile doar în cadrul cabinetului (tenant isolation)
- [ ] Presigned URLs cu expirare pentru download
- [ ] Sanitizare input pe toate extragerile AI (prompt injection prevention)

### Performanță:
- [ ] Upload → procesare: job async, nu blochează UI
- [ ] Extragere ghid complet: < 60s
- [ ] Validare element: < 200ms (lookup în reference_tables)
- [ ] Generare document Neemia: < 30s per document
- [ ] SSE latency: < 100ms

### Consistență date:
- [ ] Modificare element → cascade re-validate → cascade re-score → SSE push
- [ ] Nicio valoare „orphan" (fiecare project_element are element_def_id valid)
- [ ] Nicio regulă cu required_elements care nu există în element_definitions
- [ ] Nicio referință la reference_table inexistentă

### Error handling:
- [ ] AI extraction fail → document marcat 'failed' + notificare consultant
- [ ] R2 unavailable → retry cu exponential backoff
- [ ] Procesare parțială → salvare ce s-a extras + reluare de unde a rămas

---

## COMANDA DE AUDIT PENTRU CLAUDE CODE

Copiază în Claude Code:

```
Citește DOCUMENT_FLOW_AUDIT.md și verifică implementarea fiecărei etape.
Pentru fiecare checkbox, raportează:
✅ Implementat (cu path-ul fișierului)
⚠️ Parțial implementat (ce lipsește)
❌ Neimplementat
🔍 Nu pot verifica (necesită runtime test)

Începe cu ETAPA 1 (UPLOAD) și continuă secvențial.
Raportează gap-uri între etape (date care se pierd la tranziție).
```

---

*DosarFonduri v2 · Document Flow Audit · Martie 2026*
