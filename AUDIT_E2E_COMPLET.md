# AUDIT END-TO-END COMPLET: Backend + Frontend
## DosarFonduri v2 — Pipeline: Ghid → Procesare → Proiect → Solomon → Neemia

> INSTRUCȚIUNI CLAUDE CODE:
> 1. Copiază acest fișier în rădăcina proiectului
> 2. Parcurge O SINGURĂ FAZĂ pe rând — nu trece la următoarea fără confirmare
> 3. Per test: citește codul REAL, execută curl/query unde posibil
> 4. NU repara nimic — doar raportează
> 5. Format: tabel cu [Test | Așteptat | Actual | PASS/FAIL | Fișier:linie]

---

# FAZA 0: PRE-CONDIȚII

## 0.1 Schema DB

```
Conectare PostgreSQL Railway:
□ Connection string valid?
□ psql sau drizzle-kit funcțional?

Per tabel, confirmă EXISTENȚA ÎN DB (nu doar în schema.ts):
□ organizations          □ users                 □ files
□ companies              □ company_associates     □ company_admins
□ company_financials     □ company_if_members
□ document_folders       □ documents
□ rules                  □ element_definitions    □ element_rule_links
□ rule_reference_links   □ guide_reference_tables
□ template_elements      □ template_placeholder_mapping
□ projects               □ project_elements       □ project_eligibility
□ project_documents      □ project_checklist      □ project_scores
□ compose_section_versions
□ scoring_criteria
□ solomon_conversations  □ solomon_messages
□ element_audit_log      □ audit_log              □ ai_usage_log
□ org_config             □ solomon_knowledge      □ api_integrations
□ provider_users         □ cabinet_codes          □ extraction_cache

Coloane critice (verifică tipul, nu doar existența):
□ documents.documentTypeClass → enum 24 valori
□ documents.classificationConfidence → numeric(3,2)
□ project_elements.element_def_id → FK nullable
□ scoring_criteria.max_points → NUMERIC (nu TEXT!)
□ project_checklist.template_id → FK nullable către documents
```

## 0.2 Servicii

```
□ curl https://<APP_URL>/api/health → 200?
□ curl https://<APP_URL>/api/health/db → tabele listate?
□ Redis conectat? (check din API health)
□ R2 accesibil? (test presigned URL)
□ Anthropic API key valid? (test clasificare cu Haiku pe text scurt)
□ BullMQ workers running? (processGuide, processTemplate, processClientDoc)
```

## 0.3 Fișiere test

```
Listează docs_exemple/ și confirmă:
□ ghidulsolicitantuluism41componenta411final.pdf
□ Anexa_3_Corelarea_Puterii....docx
□ Anexa_4_Lista_UAT_ANC.xlsx
□ e-1-2-fisa-de-evaluare-generala-sm-41.docx
□ CI Anda Chis.pdf
□ Bilant_AndaOana_38480585_2023_12.pdf
□ Certificat constatator ANDA OANA....pdf
□ Oferte preț (×4: tractor, semănătoare, disc, cultivator)
□ Template_Memoriu.docx
□ Anexa_1_CEREREA_De_FINANTARE_M4_1.pdf
□ Anexa_2_Anexa_B.pdf
□ Anexa_2_Anexa_C.pdf
```

## 0.4 Frontend build

```
□ next build reușit fără erori?
□ tsc --noEmit clean?
□ Aplicația se încarcă în browser? URL + screenshot
□ Login funcțional? Redirect la dashboard?
```

---

# FAZA 1: UPLOAD ȘI PROCESARE GHID

## 1A — Backend

### 1A.1 Upload ghid

```
TEST: Upload ghidulsolicitantuluism41componenta411final.pdf
RUTA: POST /api/documents/upload sau /presign + PUT R2

□ Document creat în DB: SELECT * FROM documents WHERE name ILIKE '%ghid%solicitant%'
  → id, r2_key, status, document_type_class
□ Fișier prezent în R2 (verifică r2Key)
□ BullMQ job creat: processGuide queue, priority 1
  → Cum verifici: check Redis keys sau worker logs
□ Status inițial document: 'pending' sau 'processing'
```

### 1A.2 Text extraction

```
□ PyMuPDF returnează text per pagină
□ Pagini cu text nativ: ? din 62 (așteptat: ~60)
□ Pagini OCR fallback: ? (așteptat: 0-2)
□ Total caractere extrase: ? (așteptat: >100.000)
□ Timp: ? ms (target: <1000ms)
□ Cost AI: $0 (local extraction)
```

### 1A.3 Reguli fixe (Sonnet)

```
□ SELECT COUNT(*) FROM rules WHERE document_id = '<ghid_id>' AND rule_type = 'fixed'
  → Așteptat: 25-33
□ Per regulă: description NOT NULL, category NOT NULL, rule_key NOT NULL
□ Categorii prezente: beneficiari_eligibili, dimensiune_economica,
  plafon_maxim, cheltuieli_neeligibile, documente_necesare
□ Categoria 'documente_necesare' există? (CRITIC pt. checklist)
  → Câte reguli cu category='documente_necesare'? Așteptat: 10-14
□ Timp: ?s (target: <15s) | Cost: ~$0.04
```

### 1A.4 Reguli interpretate (Opus + ET)

```
□ SELECT COUNT(*) FROM rules WHERE document_id = '<ghid_id>' AND rule_type = 'interpreted'
  → Așteptat: 5-15
□ confidence_score per regulă: MIN, MAX, AVG
□ Câte cu confidence < 0.85 (needs_review=true)? 
□ Timp: ?s (target: <45s) | Cost: ~$0.25
```

### 1A.5 Scoring criteria

```
□ SELECT COUNT(*) FROM scoring_criteria WHERE guide_document_id = '<ghid_id>'
  → Așteptat: 15-20
  → Dacă 0: TABELUL LIPSEȘTE DIN DB? (blocker cunoscut)
□ Per criteriu: name, max_points (tip NUMERIC!), category
□ SELECT SUM(max_points) per componentă → fiecare = 100?
□ 3 componente prezente? (I, II, III)
```

### 1A.6 Element definitions

```
□ SELECT COUNT(*) FROM element_definitions WHERE guide_document_id = '<ghid_id>'
  → Așteptat: 40-60
  → Dacă 0: TABELUL LIPSEȘTE DIN DB? (blocker cunoscut)
□ Per element: element_key, display_name, data_type, category, is_required
□ Categorii: applicant, financial, project, farm, location
□ SELECT COUNT(*) FROM element_rule_links WHERE ... → linkuri create?
```

### 1A.7 Reference tables

```
□ SELECT COUNT(*) FROM guide_reference_tables WHERE guide_document_id = '<ghid_id>'
  → Așteptat: 3-6
□ Tabel "Corelație putere/suprafață" prezent?
  → headers corect? rows corect? 
  → Lookup: 270ha → 201-500 → max 400CP?
□ Tabel UAT ANC prezent (din Anexa 4)?
```

### 1A.8 Finalizare

```
□ Document status: 'processed'
□ trust_score calculat? Valoare: ? (target: >0.8)
□ Timp total procesare: ?s (target: <60s)
□ Cost total AI: $? (target: <$0.35)
```

## 1B — Frontend

### 1B.1 Upload UI

```
□ Ce componentă gestionează upload-ul pe pagina Documente?
  → Fișier: ? Linie: ?
□ Butonul "+" sau "Upload" — vizibil? Funcțional?
□ File picker: ce tipuri acceptă? (.pdf, .docx, .xlsx?)
□ Drag & drop: suportat? Dacă nu, doar click?
□ Progress bar upload: vizibil? Per fișier?
  → Componentă: ? SSE sau poll?
```

### 1B.2 Procesare — ce vede utilizatorul

```
□ Loading state în timpul procesării:
  → Spinner pe card document?
  → Progress bar cu "Procesare pagina X/62"?
  → Sau doar badge "Processing..." static?
  → Componentă: ? Fișier: ?
□ SSE events consumate în frontend:
  → EventSource creat unde? Fișier: ?
  → Ce events ascultă: guide_processed? processing_progress?
  → Ce actualizează în UI la primire event?
  → TanStack Query invalidation: ce query keys?
```

### 1B.3 Post-procesare — card document

```
□ Badge "✓ Procesat AI" — condiție: document.status === 'processed'?
  → Componentă: ? Fișier: ?
□ "33 reguli" — de unde ia numărul?
  → API call separat? Sau proprietate pe document?
  → Fișier: ?
□ "▼ Detalii" expand — ce componentă?
□ Error state: dacă procesarea eșuează, ce vede user-ul?
  → Badge "❌ Eroare"? Mesaj detaliat?
  → Buton "Reîncearcă" vizibil? Ce API apelează?
```

### 1B.4 Tab-uri expand detalii ghid

```
□ Tab "Reguli" (🛡️):
  → Componentă: ? Fișier: ?
  → API call: GET /api/...? Lazy load la click pe tab?
  → Per regulă: descriere, tip (FIXĂ/INTER), confidence, validated badge
  → Empty state dacă 0 reguli?
□ Tab "Criterii" (📊):
  → Componentă: ? API call: ?
  → Tabel cu: nume, maxPoints, categorie
  → Total afișat? (sumă maxPoints)
  → Empty state?
□ Tab "Elemente" (📋):
  → Componentă: ? API call: ?
  → Lista: elementKey, displayName, dataType, isRequired
  → Empty state?
□ Tab "Anexe & Date":
  → Există? Componentă ReferenceTableViewer?
  → Tabelele LOOKUP vizibile? (Anexa 3, Anexa 4)
  → Buton "Validează" funcțional?
```

---

# FAZA 2: UPLOAD TEMPLATE-URI

## 2A — Backend

### 2A.1 Template DOCX (Memoriu)

```
□ Upload Template_Memoriu.docx → document creat
□ Clasificare: documentTypeClass = 'memoriu_template'
□ BullMQ job: processTemplate
□ Extragere {{placeholders}}: câte? (python-docx regex)
□ generationMode setat: 'COMPOSE'
□ SELECT COUNT(*) FROM template_elements WHERE document_id = '<id>'
□ templatePlaceholderMapping creat? Câte entries?
□ Auto-map la element_definitions: câte match-uri?
```

### 2A.2 Template PDF (Cerere Finanțare)

```
□ Upload Anexa_1_CEREREA_De_FINANTARE_M4_1.pdf
□ Clasificare: cerere_finantare_template
□ XFA/AcroForm extraction: câte form fields? (PyMuPDF)
□ Dacă 0 fields → Vision fallback: câte câmpuri?
□ generationMode: 'FILL'
□ Coordonate per câmp salvate? (x%, y%, width%, height%)
□ Câmpuri critice detectate: CUI, CNP, titlu, amplasare, plan financiar
□ Tabelele din cerere detectate ca structuri?
□ Checkboxurile din Secțiunea E detectate?
```

### 2A.3 Template PDF (Anexa B/C)

```
□ Upload Anexa_2_Anexa_B.pdf → clasificare: anexa_b_template
□ Upload Anexa_2_Anexa_C.pdf → clasificare: anexa_c_template
□ Formular detectat cu câmpuri matrice viabilitate?
□ Formule detectate? (RAFN, rata îndatorării, VAN)
```

## 2B — Frontend

### 2B.1 Upload template

```
□ Upload pe pagina Documente, folder "Template-uri"
□ Procesare progress vizibil?
□ Badge "Template" (albastru) după procesare?
□ generationMode vizibil pe card? Badge FILL/COMPOSE?
□ Nr. elemente detectate vizibil pe card?
```

### 2B.2 Template Viewer

```
□ Pagina /documents/template/[id] există?
  → Fișier: ? Componente: ?
□ Layout split pane: stânga elements, dreapta preview
□ Elements list:
  → Grouped by page?
  → Per element: key, label, fieldType, validated badge
  → Click pe element → highlight pe preview?
□ Preview document:
  → PDF: iframe, react-pdf, sau canvas?
  → DOCX: convertit la PDF pt. preview? Sau text preview?
  → Overlay câmpuri detectate pe pagini?
□ Toggle FILL/COMPOSE:
  → Ce schimbă vizual? Vizibil?
□ Config generare (COMPOSE):
  → Secțiuni vizibile? narrative/table/calculation per secțiune?
□ Buton "Generează" → ce API apelează?
□ Link de acces din lista Documente → Template Viewer
  → Buton/link vizibil? Sau trebuie URL manual?
```

---

# FAZA 3: CREARE PROIECT

## 3A — Backend

### 3A.1 API creare

```
TEST: POST /api/projects
BODY: { companyId, folderId, name: "Test Audit E2E" }

□ Proiect creat: id, status='draft'
□ projectElements inițializate din element_definitions?
  → SELECT COUNT(*) FROM project_elements WHERE project_id = '<id>'
  → Așteptat: 40-60 (toate cu value=null)
□ projectEligibility inițializat din rules?
  → SELECT COUNT(*) FROM project_eligibility WHERE project_id = '<id>'
  → Așteptat: 25-33, status='unchecked'
□ projectScores inițializat din scoring_criteria?
  → SELECT COUNT(*) FROM project_scores WHERE project_id = '<id>'
□ projectChecklist populat din rules category='documente_necesare'?
  → SELECT * FROM project_checklist WHERE project_id = '<id>'
  → Câte items? Așteptat: 10-14, toate done=false
  → Categorii: Juridice, Financiare, Tehnice, Declarații
□ Date firmă pre-populate din companies?
  → projectElements cu source='onrc' sau 'system'?
  → CUI, denumire, adresa, CAEN populate?
```

### 3A.2 Funcția populateChecklistFromRules()

```
□ Fișier: routes/projects.ts ~ linia 310-358
□ Citește reguli cu category='documente_necesare'
□ Per regulă: creează checklist item cu name, category auto
□ categorizeDocument() funcționează? Output per tip document?
□ Dacă 0 reguli cu category='documente_necesare': checklist gol! (BLOCKER)
```

## 3B — Frontend

### 3B.1 Wizard creare proiect

```
□ Buton "+ Proiect nou" pe pagina Proiecte
  → Componentă modal/wizard: ? Fișier: ?
□ Step 1: Selectare firmă
  → API: GET /api/companies?cabinetId=...
  → Lista firmelor vizibilă? Click selectare funcțional?
  → Buton "Adaugă firmă nouă" inline? (da/nu)
□ Step 2: Selectare program/masura
  → API: GET /api/programs sau folders tree
  → Warning dacă masura nu are ghid procesat?
  → Info: "33 reguli, 45 câmpuri" per masura?
□ Step 3: Confirmare
  → Recap firmă + program vizibil
  → Buton "Crează proiect" → API call → redirect
□ Post-creare:
  → Redirect la /projects/[id] automat?
  → Ce tab se deschide default?
```

### 3B.2 Pagina proiect — Layout

```
□ Sidebar proiect (stânga):
  → Ce secțiuni apar? Listează toate cu fișier:linie
  → Sumar, Eligibilitate, Ghid Finanțare, Solomon, 
     Elemente, Checklist doc, Neemia, Implementare, Monitorizare
  → Per secțiune: badge cu counter (0/33, 0/0, etc.)
  → Secțiuni TBD/disabled marcate?
□ Routing:
  → /projects/[id] cu tab query param?
  → Sau sub-componente inline cu state?
  → Deep link funcțional? (ex: /projects/[id]?tab=solomon)
□ Header proiect:
  → Nume proiect, firmă, CUI, program, status badge
  → Buton "Editare" / "Setări proiect"?
```

---

# FAZA 4: UPLOAD DOCUMENTE CLIENT

## 4A — Backend (per document)

### 4A.1 Certificat Constatator

```
□ Upload CC ANDA OANA → clasificare: certificat_constatator
□ Confidence clasificare: ? (target: >0.8)
□ Extragere: 34 câmpuri (cf. raport simulare)
□ Salvare projectElements: 34 rows cu source='ocr'
□ Re-check eligibilitate automat? (trigger)
□ Audit log: 34 entries
□ AUTO-CHECKLIST (Gap 1): item CC → done=true?
□ SSE: field_extracted (×34), document_processed, checklist_updated
```

### 4A.2 Bilanț ANAF

```
□ Upload Bilant → clasificare: bilant_anaf
□ Extragere: ~29 câmpuri (cifra_afaceri_2023, profit_net_2023, etc.)
□ Pattern matching dinamic: cifra_afaceri_(\d{4}) → SALVAT
□ Indicatori financiari calculați?
□ AUTO-CHECKLIST: item bilanț → done=true?
```

### 4A.3 Carte Identitate

```
□ Upload CI → clasificare: carte_identitate
□ Text extraction: PyMuPDF sau Vision fallback?
□ Extragere: 16 câmpuri
□ CNP: criptat AES-256 ÎNAINTE de salvare? Verifică DB: value criptat?
□ AUTO-CHECKLIST: item CI → done=true?
```

### 4A.4 Diplomă studii

```
□ Upload diploma → clasificare: diploma_studii
□ Extragere: 13 câmpuri (FIX-UIT de la 0)
□ Key-uri corecte: tip_document_studii, specializare_studii
□ AUTO-CHECKLIST: item diplomă → done=true?
□ Scoring impact: puncte bonus tânăr fermier cu studii agricole?
```

### 4A.5 Oferte preț (×4)

```
Per ofertă (tractor, semănătoare, disc, cultivator):
□ Clasificare: oferta_pret
□ Extragere: ~11 câmpuri (furnizor, utilaj, preț)
□ Pattern dinamic: articol_0_utilaj_denumire etc.
□ AUTO-CHECKLIST: item oferte → done=true?
□ Corelație putere/suprafață: tractor 280CP + 270ha → check Anexa 3
```

### 4A.6 Stare globală după toate upload-urile

```
□ SELECT COUNT(*) FROM project_elements WHERE project_id = '<id>' AND value IS NOT NULL
  → Așteptat: 130+ (34 CC + 29 bilanț + 16 CI + 13 diplomă + 44 oferte)
□ SELECT * FROM project_checklist WHERE project_id = '<id>'
  → done=true: ~8 items
  → done=false: ~4-6 items (memoriu, expert, cofinanțare)
  → Progress: ~60%
□ SELECT COUNT(*) FROM element_audit_log WHERE project_id = '<id>'
  → 130+ entries
```

## 4B — Frontend

### 4B.1 Upload pe pagina proiect

```
□ Buton upload: unde pe pagina proiect? Ce componentă?
  → Pe tab-ul Documente? Sau global?
  → Acceptă multiple fișiere simultan?
□ Progress upload per fișier: vizibil?
  → Componentă: ?
  → Progress bar / spinner / text?
□ Clasificare badge post-upload:
  → Badge tip document (ex: "Certificat Constatator") vizibil?
  → Badge "MANUAL" dacă clasificare eșuată?
```

### 4B.2 Actualizări live post-upload

```
□ SSE EventSource: creat unde? Fișier: ?
  → Un singur EventSource per proiect? Sau per pagină?
□ La SSE field_extracted:
  → Tab Elemente se actualizează fără refresh?
  → Counter elemente completate se actualizează?
□ La SSE document_processed:
  → Lista documente se actualizează?
  → Badge status document se schimbă?
□ La SSE checklist_updated (Gap 1):
  → Tab Checklist se actualizează?
  → Counter sidebar se actualizează?
□ TanStack Query invalidation:
  → Ce query keys se invalidează la SSE?
  → Fișier: ? queryClient.invalidateQueries(...)?
  → Sau manual refetch?
```

### 4B.3 Tab Checklist documente

```
□ Componentă: ? Fișier: ?
□ Progress ring/bar: vizibil? Procent corect?
□ Categorii colapsabile: Juridice, Financiare, Tehnice, Declarații
□ Per item:
  → Checkbox: click toggle done manual funcțional?
  → Nume document vizibil
  → Badge sursa: "GHID" (din reguli) / "MANUAL" (adăugat de consultant)
  → Badge "MAPAT" dacă templateId setat?
  → Meniul "⋯": Mapează template / Mută categorie / Șterge
□ Buton "Mapează template":
  → Ce face la click? Dropdown cu ce opțiuni?
  → API apelat: PUT /api/projects/.../checklist/... ?
  → Se poate de-mapa? Re-mapa?
□ Buton "+ Adaugă document":
  → Form inline: input name + select categorie?
  → API: POST /api/projects/.../checklist
□ Empty state: ce apare dacă checklist e gol?
□ Items auto-marcate (Gap 1):
  → CC uploadat → item "Certificat Constatator" auto done=true?
  → Dacă nu: Gap 1 NEIMPLEMENTAT — raportează
□ Banner "Template-uri nemapate":
  → Apare? Cu lista template-urilor fără document asociat?
```

### 4B.4 Tab Elemente

```
□ Componentă: ? Fișier: ?
□ Lista elementelor cu valori:
  → Grouped by categorie? (applicant, financial, farm, etc.)
  → Per element: key, displayName, valoare, sursa (badge ocr/ai/manual)
  → Câmpuri cu valoare: fundal verde/normal?
  → Câmpuri fără valoare: fundal gri/roșu?
□ Editare inline: click pe valoare → edit?
  → API: PATCH/PUT → ce endpoint?
  → Audit log creat la edit manual?
□ Tabelele (Plan financiar, etc.):
  → Afișate ca tabel editabil? Sau ca liste plate de câmpuri?
  → Formule calculate live la editare?
□ Counter header: "85/130 câmpuri completate"
```

---

# FAZA 5: SOLOMON — Chat AI

## 5A — Backend

### 5A.1 Inițializare Solomon

```
TEST: POST /api/chat { agentType: 'solomon', projectId: '<id>' }

□ Conversație creată în solomon_conversations?
□ System prompt construit cu:
  → Date firmă (projectElements source='onrc')
  → Date extrase (source='ocr')
  → Reguli eligibilitate
  → Scoring criteria
  → Reference tables (Anexa 3, 4)
  → Element definitions (câmpuri necesare)
  → Câmpuri COMPLETATE vs LIPSĂ (lista explicită)
□ Model: Claude Opus + Extended Thinking?
□ buildSystemPrompt() — fișier: ? Ce include exact?
```

### 5A.2 Test eligibilitate

```
TEST: Mesaj "Verifică eligibilitatea firmei ANDA OANA"

□ Solomon evaluează criterii:
  → Beneficiar eligibil (SRL, CAEN agricol)
  → Dimensiune SO
  → Proiecte în derulare
  → Registrul debitorilor
□ Răspuns structurat cu pass/fail per criteriu?
□ projectEligibility actualizat în DB?
□ SSE: eligibility_updated?
```

### 5A.3 Test completare câmpuri

```
TEST: Mesaj "Titlul proiectului: Achiziție utilaje agricole..."

□ Solomon extrage: project.title → projectElements
□ source='ai', sourceAgent='solomon'
□ Audit log: changeSource='ai'
□ SSE: field_extracted
```

### 5A.4 Test date financiare

```
TEST: Mesaj "Valoarea totală 250.000 EUR, eligibilă 200.000 EUR"

□ Multiple câmpuri extrase simultan
□ Calcule automate declanșate (contribuție proprie, finanțare)
□ Verificare vs plafon maxim
□ Scoring recalculat
```

### 5A.5 Test referință tabele

```
TEST: Mesaj "Vreau tractor 280CP pentru 270 hectare"

□ Solomon consultă guide_reference_tables
□ Lookup Anexa 3: 270ha → 201-500 → max 400CP
□ Răspuns: "280CP sub limita de 400CP, corelație OK"
```

### 5A.6 Test awareness checklist

```
TEST: Mesaj "Ce documente mai am de uploadat?"

□ Solomon accesează projectChecklist?
□ Listează items cu done=false?
□ Sau: NU are acces? (Gap nerezolvat — raportează)
```

## 5B — Frontend

### 5B.1 Chat interface

```
□ Componentă chat: ? Fișier: ?
□ Layout: input jos, mesaje sus (scroll)
□ Message list:
  → Mesaje user: aliniate dreapta? Styling?
  → Mesaje Solomon: aliniate stânga? Avatar/icon?
  → Scroll automat la mesaj nou?
  → Conversație persistentă (refresh → mesaje rămân)?
□ Input area:
  → Textarea sau input simplu?
  → Enter = send? Shift+Enter = newline?
  → Buton send vizibil?
  → Placeholder text?
□ Upload fișier în chat:
  → Buton paperclip/attach vizibil?
  → Ce tipuri acceptă?
  → Fișierul se procesează inline?
```

### 5B.2 Streaming răspuns

```
□ SSE streaming implementat:
  → EventSource creat la send message?
  → Text apare progresiv (token by token)?
  → Sau: apare tot deodată după procesare?
  → Componentă streaming: ? Fișier: ?
□ Loading indicator:
  → "Solomon gândește..." vizibil?
  → Typing indicator (dots animat)?
  → Timeout: dacă Opus durează >30s, ce se întâmplă?
```

### 5B.3 Side effects vizuale

```
□ Când Solomon completează un câmp:
  → Notificare vizibilă? "Solomon a completat 3 câmpuri noi"?
  → Tab Elemente se actualizează live?
  → Counter sidebar se actualizează?
  → Eligibilitate re-evaluată vizual?
□ Sidebar proiect:
  → Eligibilitate: "0/33" → "22/33" se schimbă live?
  → Elemente: counter crește?
  → Checklist: counter crește? (dacă Gap 1 implementat)
```

---

# FAZA 6: ELIGIBILITATE ȘI SCORING

## 6A — Backend

```
TEST: GET /api/projects/{id}/eligibility

□ Total reguli evaluate: 25-33
□ Per regulă: status (pass/fail/unchecked/not_applicable)
□ Cu datele ANDA OANA, așteptat:
  → Beneficiar eligibil: PASS
  → Dimensiune SO: PASS (sau calculat?)
  → Cerere unică: PASS
  → Semnătură electronică: UNCHECKED
□ Câte PASS / FAIL / UNCHECKED?
□ Total eligibility score: X/33

TEST: GET /api/projects/{id}/scoring

□ Total criterii: 15-20
□ Per criteriu: score calculat, maxPoints
□ Criterii auto-calculate: dimensiune SO, sector vegetal, zona ANC
□ Total estimat: ? din 100
□ Peste prag calitate? (56 pt. luna curentă)
```

## 6B — Frontend

### 6B.1 Tab Eligibilitate

```
□ Componentă: ? Fișier: ?
□ Header: "Eligibilitate: 22/33" cu progress bar
□ Per regulă:
  → Badge colorat: verde PASS, roșu FAIL, gri UNCHECKED
  → Descriere regulă vizibilă
  → Expandable cu detalii? (evaluationLogic, sursa datelor)
  → Dacă FAIL: motiv clar afișat?
□ Warning dacă reguli FAIL: banner roșu?
□ Live update: SSE eligibility_updated → UI refresh fără F5?
```

### 6B.2 Tab Scoring

```
□ Componentă: ? Fișier: ?
□ Tabel cu criterii, punctaj per criteriu, total
□ Per criteriu:
  → Nume, categorie, punctaj obținut / maxim
  → Explicație cum s-a calculat?
□ Total afișat bold: "72 din 100 puncte"
□ Warning sub prag calitate:
  → Banner galben: "Sub pragul de 56 puncte" dacă e cazul
  → Sau badge verde dacă peste prag
□ Componenta scoringCriteria:
  → maxPoints afișat corect (numeric, nu string)?
  → Total per componentă (I, II, III)?
```

---

# FAZA 7: NEEMIA — Generare Documente

## 7A — Backend

### 7A.1 Pre-validare

```
TEST: validateComposeReadiness() cu proiectul test

□ Returnează canGenerate: true?
□ completeness: ? (procent projectElements completate)
□ missingCritical: ? (documente critice lipsă)
□ missingWarning: ? (Gap 2 implementat?)
□ Blueprint requiredElementKeys verificate? (Gap 3 implementat?)
□ Per secțiune: readiness score?
```

### 7A.2 FILL — Cerere Finanțare

```
TEST: POST /api/neemia/generate { templateId: cerere, projectId, mode: 'fill' }

□ buildElementsMap(): mapare corectă?
□ Câmpuri completate: ? din total (așteptat: 60+ din 87)
□ Formatare RO: "125.500,00 EUR" verificat în output
□ Tabel Plan Financiar completat cu date din bilanț + oferte?
□ Secțiunea E: checkboxuri bifate din checklist?
□ Câmpuri lipsă: marcate "[DE COMPLETAT]"?
□ PDF output salvat în R2?
□ Branding aplicat? (font, footer din cabinetSettings)
□ Timp generare: ?s (target: <30s)
```

### 7A.3 FILL — Anexa B

```
TEST: Generare Anexa B cu date financiare

□ Matrice viabilitate completată
□ Formule calculate determinist (nu AI):
  → RAFN >= 1.2?
  → Rata îndatorării <= 60%?
  → VAN >= 0?
□ Coloana Diferențe + Validare completate
□ Warning pe indicatori care nu respectă limita
```

### 7A.4 COMPOSE — Memoriu Justificativ

```
TEST: POST /api/neemia/generate { templateId: memoriu, projectId, mode: 'compose' }

□ Blueprint disponibil pe template?
□ Context assembly: date filtrate per secțiune?
□ Per secțiune generată:
  → Text profesional (Writing Kit aplicat)?
  → Date concrete din projectElements?
  → Keywords AFIR prezente?
  → Lungime adecvată?
  → [DE COMPLETAT] pe câmpuri lipsă?
□ DOCX output cu branding (font, culori, footer)?
□ Timp: ?s (target: <45s)
```

### 7A.5 Post-generare

```
□ Document generat salvat în project_documents?
□ Checklist items: memoriu → done=true automat?
□ generatedDocuments entry creat cu completionMap?
```

## 7B — Frontend

### 7B.1 Lista template-uri proiect (tab Neemia)

```
□ Componentă: ? Fișier: ?
□ Per template:
  → Nume, tip (DOCX/PDF/XLSX), badge FILL/COMPOSE
  → Progress bar: câmpuri completate / total
  → Buton "Generează"
  → Buton "Descarcă" (dacă deja generat)
```

### 7B.2 Pre-generare warnings

```
□ Warning checklist (Gap 2):
  → Banner galben "Lipsesc documente: bilanț, oferte"?
  → Buton "Generează oricum" + "Completează întâi"?
  → Sau: direct generare fără warning? (Gap 2 neimplementat)
□ Warning blueprint (Gap 3):
  → Per secțiune: completare % afișat?
  → Câmpuri lipsă listate?
  → Buton "Completează cu Solomon"?
  → Sau: nu există verificare per secțiune? (Gap 3 neimplementat)
```

### 7B.3 Progress generare

```
□ SSE streaming progress:
  → "Completare pagina 15/62..." vizibil?
  → Progress bar animat?
  → Sau: spinner static fără detalii?
□ Timp așteptare: ce vede user-ul 30+ secunde?
```

### 7B.4 Post-generare

```
□ Preview document:
  → PDF: iframe, react-pdf, canvas?
  → DOCX: convertit la PDF pt. preview?
  → Vizualizare inline sau tab nou?
□ Download:
  → Buton "Descarcă" funcțional?
  → Format corect (PDF/DOCX)?
  → Nume fișier descriptiv?
□ COMPOSE edit post-generare:
  → Secțiuni editabile inline? Textarea/rich editor?
  → "Regenerează" per secțiune?
  → Modificările se salvează? (composeSectionVersions)
□ Branding vizibil:
  → Font din configurări cabinet?
  → Footer text cabinet?
  → Culori tabele?
```

---

# FAZA 8: VERIFICARE FINALĂ

## 8A — Consistență date

```
□ CUI identic: CC = bilanț = cerere finanțare = projectElements?
□ Nume solicitant identic peste tot?
□ Valori financiare consistente (bilanț → cerere → anexa B)?
□ Suprafață fermă consistentă (dacă în multiple surse)?
```

## 8B — Performance

```
□ Timp procesare ghid complet: ?s (target: <60s)
□ Timp upload + extragere 9 documente: ?s total
□ Timp generare Cerere Finanțare: ?s (target: <30s)
□ Timp generare Memoriu: ?s (target: <45s)
□ Cost AI total per dosar: $? (target: <$2.00)
□ Solomon first token: ?ms (target: <1500ms)
```

## 8C — Audit trail

```
□ SELECT COUNT(*) FROM element_audit_log WHERE project_id = '<id>'
□ Per entry: changed_by, element_key, old_value, new_value, source, timestamp
□ Solomon conversations: mesajele persistate?
□ ai_usage_log: cost per model per operație?
```

## 8D — Frontend transversal

```
□ Loading states: FIECARE acțiune async are indicator vizual?
  → Listează acțiunile FĂRĂ loading state
□ Error states: toast/notification pe erori API?
  → Testează: deconectează rețeaua, apasă upload → ce apare?
□ Empty states: mesaje pe liste goale?
  → Proiect nou: tab Elemente gol → mesaj?
  → Checklist gol → mesaj?
□ Zustand stores: ce stores există?
  → Fișier: ? Per store: ce state gestionează?
□ TanStack Query keys:
  → Listează principalele query keys
  → Stale time: cât e configurat?
□ SSE management:
  → Un singur EventSource per proiect?
  → Se închide la navigare away?
  → Reconnect automat la pierdere conexiune?
□ Responsive 1024px: pagina proiect funcțională pe tablet?
```

---

# TABEL SUMAR

```
| Fază | Teste Backend | B-PASS | B-FAIL | Teste Frontend | F-PASS | F-FAIL |
|------|---------------|--------|--------|----------------|--------|--------|
| 0    |               |        |        |                |        |        |
| 1    |               |        |        |                |        |        |
| 2    |               |        |        |                |        |        |
| 3    |               |        |        |                |        |        |
| 4    |               |        |        |                |        |        |
| 5    |               |        |        |                |        |        |
| 6    |               |        |        |                |        |        |
| 7    |               |        |        |                |        |        |
| 8    |               |        |        |                |        |        |
| TOTAL|               |        |        |                |        |        |
```

Per FAIL, raportează:
- ID test (ex: 4B.2.3)
- Ce a eșuat
- Fișier:linie
- Impact: BLOCKER / MAJOR / MINOR
- Sugestie fix (1 linie)

---

*DosarFonduri v2 · Audit E2E Complet · Martie 2026*
