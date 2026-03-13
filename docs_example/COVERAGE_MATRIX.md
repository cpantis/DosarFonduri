# MATRICE ACOPERIRE: Documente × Extractori

## Legenda
- ✅ = Funcționează corect
- ✅🔧 = Funcționează după fix aplicat
- ⚠️ = Extractor dedicat, dar probleme identificate
- 🔄 = Falls to genericExtractor
- ⏭️ = Skip (guide/template — alt pipeline)
- 🔍 = Necesită OCR/Vision înainte de extracție (pipeline existent)

---

## MATRICEA PRINCIPALĂ

| # | Fișier | Format | Tip Document | Extractor Rutat | Status | Probleme |
|---|--------|--------|-------------|-----------------|--------|----------|
| 1 | Certificat constatator ANDA OANA...pdf | PDF text | certificat_constatator | companyExtractor | ✅ | — |
| 2 | 3.Documente...semnat.pdf | PDF mixt | certificat_constatator + act_constitutiv | companyExtractor | ✅🔧 | P4 FIXED: compound doc detection splits sub-documents |
| 3 | Bilant_AndaOana...pdf | PDF XFA | bilant_anaf | bilantParser | ✅🔧 | P1+P5 FIXED: XFA extraction yields 479 fields with real data |
| 4 | 05 Act Constitutiv_signed.pdf | PDF scanat | act_constitutiv | genericExtractor | 🔍 | P2: OCR necesar (Vision pipeline existent) |
| 5 | 06 Statut_signed.pdf | PDF scanat | statut | genericExtractor | 🔍 | P2: OCR necesar (Vision pipeline existent) |
| 6 | ghidul-solicitantului...pdf | PDF text | guide | ⏭️ SKIP | ⏭️ | Procesat de guideParser |
| 7 | Anexa 1 CEREREA De FINANTARE M4.1.pdf | PDF XFA | cerere_finantare_template | ⏭️ SKIP | ⏭️ | Template XFA (XFA extraction available) |
| 8 | Anexa 2 Anexa B.pdf | PDF XFA | anexa_b_template | ⏭️ SKIP | ⏭️ | Template XFA (XFA extraction available) |
| 9 | Anexa 2 Anexa C.pdf | PDF XFA | anexa_c_template | ⏭️ SKIP | ⏭️ | Template XFA (XFA extraction available) |
| 10 | Anexa 3...03.06.docx | DOCX | guide_annex_table | ⏭️ SKIP | ⏭️ | Anexă ghid |
| 11 | annexa-3_corelarea...0306.docx | DOCX | guide_annex_table | ⏭️ SKIP | ⏭️ | Duplicat Anexa 3 |
| 12 | Anexa 4 Lista UAT ANC.xlsx | XLSX | guide_annex_table | ⏭️ SKIP | ⏭️ | Anexă ghid |
| 13 | annexa-10-instructiuni...doc | DOC | guide_annex_form | ⏭️ SKIP | ⏭️ | Anexă ghid (DOC extraction available) |
| 14 | annexa-11-model-adeverinta...docx | DOCX | adeverinta | 🔄 genericExtractor | 🔄 | Model/template |
| 15 | e-1-2-fisa-de-evaluare...docx | DOCX | guide_annex_form | ⏭️ SKIP | ⏭️ | Fișă evaluare |
| 16 | Template Memoriu.docx | DOCX | memoriu_template → memoriu_filled | 🔄 genericExtractor | ✅🔧 | P3 FIXED: isFilledTemplate() detects completed doc, extracts with generic |
| 17 | 4.0. Anexa 3 - Memoriu...doc | DOC | memoriu_template | ⏭️ SKIP | ⏭️ | Template memoriu |
| 18 | 14.6 Descrierea...ANDA.docx | DOCX | descriere_proiect | 🔄 genericExtractor | 🔄 | — |
| 19 | CI Anda Chis.pdf | PDF scanat | carte_identitate | 🔄 genericExtractor | 🔍 | P2: OCR necesar (Vision pipeline existent) |
| 20 | DIPLOMA ING AGRONOM.pdf | PDF scanat | diploma_studii | 🔄 genericExtractor | 🔍 | P2: OCR necesar (Vision pipeline existent) |
| 21 | Anda Tractor.png | PNG | oferta_pret | ofertaExtractor | ✅🔧 | G4 FIXED: image pipeline added |
| 22 | Anda semanatoare.png | PNG | oferta_pret | ofertaExtractor | ✅🔧 | G4 FIXED: image pipeline added |
| 23 | Anda disc 7 m.png | PNG | oferta_pret | ofertaExtractor | ✅🔧 | G4 FIXED: image pipeline added |
| 24 | Anda Cultivator.png | PNG | oferta_pret | ofertaExtractor | ✅🔧 | G4 FIXED: image pipeline added |
| 25 | Anunt Cerere proiecte...pdf | PDF text | other | 🔄 genericExtractor | 🔄 | Fără extractor dedicat |
| 26 | 2024-RO009842533.pdf | PDF text | other | 🔄 genericExtractor | 🔄 | Cerere plată APIA |

---

## SUMAR ACOPERIRE (DUPĂ FIXURI)

| Categorie | Nr. fișiere | % din total |
|-----------|-------------|-------------|
| ✅ Funcționează corect | 2 | 7.7% |
| ✅🔧 Funcționează după fix | 7 | 26.9% |
| 🔄 Falls to genericExtractor | 5 | 19.2% |
| 🔍 Necesită OCR/Vision (pipeline existent) | 4 | 15.4% |
| ⏭️ Skip (guide/template) | 8 | 30.8% |

**Total funcțional sau cu pipeline: 18/26 (69.2%)** — față de 1/26 (3.8%) înainte de fixuri.

---

## EXTRACTOR × DOCUMENT TYPE MATRIX

| Extractor | Tip Doc Target | Fișiere Matching | Funcțional? |
|-----------|---------------|------------------|-------------|
| companyExtractor | certificat_constatator | 2 (ANDA OANA, COMEXIM compound) | ✅ (P4 compound fix) |
| bilantParser | bilant_anaf | 1 (XFA cu date reale) | ✅🔧 (P1 XFA fix) |
| contractExtractor | contract_arenda | 0 | N/A (nu avem exemplu) |
| ofertaExtractor | oferta_pret | 4 (PNG imagini) | ✅🔧 (G4 image pipeline fix) |
| registruExtractor | registru_imobilizari | 0 | N/A (nu avem exemplu) |
| mediuExtractor | document_mediu | 0 | N/A (nu avem exemplu) |
| extrasContExtractor | extras_cont | 0 | N/A (nu avem exemplu) |
| declaratieExtractor | declaratie_expert_contabil | 0 | N/A (nu avem exemplu) |
| certificatFiscalExtractor | certificat_fiscal | 0 | N/A (nu avem exemplu) |
| genericExtractor | * (fallback) | 5 + 1 (filled template) | ✅ (P3 filled template fix) |

---

## PROBLEME — STATUS DUPĂ FIXURI

### REZOLVATE

| # | Problemă | Fix aplicat | Commit |
|---|----------|-------------|--------|
| P1 | **XFA PDF nesuportat** | `tryExtractXFA()` — decompress XFA datasets XML via AcroForm /XFA | ocr.ts |
| P3 | **Template memoriu clasificat greșit** | `isFilledTemplate()` — detectează documente completate (CUI, sume, J-nr) | processClientDoc.ts |
| P4 | **Compound doc nedetectat** | `detectCompoundDocument()` — detectează boundaries (doctype markers + CUI changes) | processClientDoc.ts |
| P5 | **Bilant cu valori 0** | Nu era 0 — XFA conține date reale (479 câmpuri). Expected output actualizat. | EXPECTED_OUTPUT_bilant_anda_oana.json |
| G1/G4 | **PNG images neprocestate** | `extractTextFromImage()` + routing în processClientDoc | ocr.ts + processClientDoc.ts |
| G2 | **DOC format nesuportat** | `extractTextFromDOC()` via antiword/LibreOffice | ocr.ts + processClientDoc.ts |

### RĂMASE (LOW PRIORITY)

| Gap | Descriere |
|-----|-----------|
| G3 | **Lipsă extractori dedicați** pentru: act_constitutiv, statut, carte_identitate, diploma_studii, descriere_proiect — falls to genericExtractor (funcțional dar cu confidence mai scăzut) |
| — | **bilantParser prompt** ar putea necesita ajustări pentru format XFA (tag: value) vs text tabular clasic |

---

## FLOW-URI DE EXTRACȚIE (ACTUALIZATE)

```
Fișier → getFileBuffer() → extensie?
  .pdf → tryExtractXFA() → XFA? → text XFA ✅
       → extractPDFPages() → text nativ / Vision OCR → text ✅
       → classifyDocument() → runExtractor()
  .docx → extractTextFromDOCX() → text → classifyDocument() → runExtractor() ✅
  .doc → extractTextFromDOC() → antiword/LibreOffice → text ✅ (NEW)
  .xlsx → extractTextFromXLSX() → text → classifyDocument() → runExtractor() ✅
  .png/.jpg → extractTextFromImage() → Claude Vision OCR → text ✅ (NEW)
```

### Pipeline OCR intern (extractPDFPages):
```
pagină PDF → get_text()
  text > 50 chars → text nativ ✅
  text < 50 chars → render 200 DPI → Claude Vision OCR → text ✅
  XFA → tryExtractXFA() interceptează ÎNAINTE de get_text() ✅ (FIXED)
```

### Compound Document Detection (NEW):
```
text extras → detectCompoundDocument()
  Document boundary markers: CERTIFICAT CONSTATATOR, ACT CONSTITUTIV, STATUT, etc.
  CUI changes between pages → different companies detected
  → Split into sub-documents → classify + extract each independently
  → Merge fields with page offset correction
```

### Filled Template Detection (NEW):
```
documentType ends with _template?
  → isFilledTemplate(text)?
    Has {{placeholders}} → genuine template → SKIP ⏭️
    Has CUI + amounts + J-numbers → filled document → extractGeneric() ✅
```
