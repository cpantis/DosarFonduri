# MATRICE ACOPERIRE: Documente × Extractori

## Legenda
- ✅ = Extractor dedicat, ar trebui să funcționeze
- ⚠️ = Extractor dedicat, dar probleme identificate
- 🔄 = Falls to genericExtractor
- ❌ = Nu se poate extrage (format incompatibil / lipsă funcționalitate)
- ⏭️ = Skip (guide/template — alt pipeline)
- 🔍 = Necesită OCR/Vision înainte de extracție

---

## MATRICEA PRINCIPALĂ

| # | Fișier | Format | Tip Document | Extractor Rutat | Status | Probleme |
|---|--------|--------|-------------|-----------------|--------|----------|
| 1 | Certificat constatator ANDA OANA...pdf | PDF text | certificat_constatator | companyExtractor | ✅ | — |
| 2 | 3.Documente...semnat.pdf | PDF mixt | certificat_constatator + act_constitutiv | companyExtractor | ⚠️ | P4: compound doc, pag 2-11 scanate |
| 3 | Bilant_AndaOana...pdf | PDF XFA | bilant_anaf | bilantParser | ❌ | P1: XFA, P5: valori 0 |
| 4 | 05 Act Constitutiv_signed.pdf | PDF scanat | act_constitutiv | genericExtractor | 🔍 | P2: OCR necesar, text gol |
| 5 | 06 Statut_signed.pdf | PDF scanat | statut | genericExtractor | 🔍 | P2: OCR necesar, text gol |
| 6 | ghidul-solicitantului...pdf | PDF text | guide | ⏭️ SKIP | ⏭️ | Procesat de guideParser |
| 7 | Anexa 1 CEREREA De FINANTARE M4.1.pdf | PDF XFA | cerere_finantare_template | ⏭️ SKIP | ⏭️ | Template XFA |
| 8 | Anexa 2 Anexa B.pdf | PDF XFA | anexa_b_template | ⏭️ SKIP | ⏭️ | Template XFA |
| 9 | Anexa 2 Anexa C.pdf | PDF XFA | anexa_c_template | ⏭️ SKIP | ⏭️ | Template XFA |
| 10 | Anexa 3...03.06.docx | DOCX | guide_annex_table | ⏭️ SKIP | ⏭️ | Anexă ghid |
| 11 | annexa-3_corelarea...0306.docx | DOCX | guide_annex_table | ⏭️ SKIP | ⏭️ | Duplicat Anexa 3 |
| 12 | Anexa 4 Lista UAT ANC.xlsx | XLSX | guide_annex_table | ⏭️ SKIP | ⏭️ | Anexă ghid |
| 13 | annexa-10-instructiuni...doc | DOC | guide_annex_form | ⏭️ SKIP | ⏭️ | Anexă ghid |
| 14 | annexa-11-model-adeverinta...docx | DOCX | adeverinta | 🔄 genericExtractor | 🔄 | Model/template |
| 15 | e-1-2-fisa-de-evaluare...docx | DOCX | guide_annex_form | ⏭️ SKIP | ⏭️ | Fișă evaluare |
| 16 | Template Memoriu.docx | DOCX | memoriu_template | ⏭️ SKIP | ⚠️ | P3: NU e template, e memoriu completat |
| 17 | 4.0. Anexa 3 - Memoriu...doc | DOC | memoriu_template | ⏭️ SKIP | ⏭️ | Template memoriu |
| 18 | 14.6 Descrierea...ANDA.docx | DOCX | descriere_proiect | 🔄 genericExtractor | 🔄 | — |
| 19 | CI Anda Chis.pdf | PDF scanat | carte_identitate | 🔄 genericExtractor | 🔍 | P2: OCR necesar |
| 20 | DIPLOMA ING AGRONOM.pdf | PDF scanat | diploma_studii | 🔄 genericExtractor | 🔍 | P2: OCR necesar |
| 21 | Anda Tractor.png | PNG | oferta_pret | ofertaExtractor | 🔍 | Imagine, necesită Vision |
| 22 | Anda semanatoare.png | PNG | oferta_pret | ofertaExtractor | 🔍 | Imagine, necesită Vision |
| 23 | Anda disc 7 m.png | PNG | oferta_pret | ofertaExtractor | 🔍 | Imagine, necesită Vision |
| 24 | Anda Cultivator.png | PNG | oferta_pret | ofertaExtractor | 🔍 | Imagine, necesită Vision |
| 25 | Anunt Cerere proiecte...pdf | PDF text | other | 🔄 genericExtractor | 🔄 | Fără extractor dedicat |
| 26 | 2024-RO009842533.pdf | PDF text | other | 🔄 genericExtractor | 🔄 | Cerere plată APIA |

---

## SUMAR ACOPERIRE

| Categorie | Nr. fișiere | % din total |
|-----------|-------------|-------------|
| ✅ Funcționează corect | 1 | 3.8% |
| ⚠️ Extractor dedicat, dar probleme | 2 | 7.7% |
| ❌ Complet nefuncțional | 1 | 3.8% |
| 🔄 Falls to genericExtractor | 5 | 19.2% |
| 🔍 Necesită OCR/Vision | 8 | 30.8% |
| ⏭️ Skip (guide/template) | 9 | 34.6% |

---

## EXTRACTOR × DOCUMENT TYPE MATRIX

| Extractor | Tip Doc Target | Fișiere Matching | Funcțional? |
|-----------|---------------|------------------|-------------|
| companyExtractor | certificat_constatator | 2 (ANDA OANA, COMEXIM compound) | ✅/⚠️ |
| bilantParser | bilant_anaf | 1 (XFA necompletat) | ❌ |
| contractExtractor | contract_arenda | 0 | N/A (nu avem exemplu) |
| ofertaExtractor | oferta_pret | 4 (PNG imagini) | 🔍 (necesită Vision) |
| registruExtractor | registru_imobilizari | 0 | N/A (nu avem exemplu) |
| mediuExtractor | document_mediu | 0 | N/A (nu avem exemplu) |
| extrasContExtractor | extras_cont | 0 | N/A (nu avem exemplu) |
| declaratieExtractor | declaratie_expert_contabil | 0 | N/A (nu avem exemplu) |
| certificatFiscalExtractor | certificat_fiscal | 0 | N/A (nu avem exemplu) |
| genericExtractor | * (fallback) | 5 | 🔄 |

---

## PROBLEME ORDONATE DUPĂ IMPACT

### CRITICE (afectează extracție completă)

| # | Problemă | Impact | Fișiere afectate | Fix estimat |
|---|----------|--------|------------------|-------------|
| P1 | **XFA PDF nesuportat** | ❌ Bilant + Cerere = 0 date extrase | 4 fișiere (15%) | Adaugă XFA XML parsing în ocr.ts |
| P2 | **Pagini scanate fără OCR routing** | 🔍 OCR funcționează dar PNG-uri nu au pipeline | 4 PNG + 4 PDF scanate (31%) | PNG-urile nu sunt rulate prin extractPDFPages |
| P4 | **Compound doc nedetectat** | ⚠️ Mix date 2 firme | 1 fișier (3.8%) | Detectare boundary + split |

### MEDII (funcționalitate redusă)

| # | Problemă | Impact | Fix estimat |
|---|----------|--------|-------------|
| P3 | **Template memoriu fără placeholders** | Clasificare greșită | Reclasifică ca document completat |
| P5 | **Bilant cu valori 0** | Test fals-pozitiv | Niciun fix (document test slab) |

### GAPS STRUCTURALE

| Gap | Descriere |
|-----|-----------|
| G1 | **PNG images**: ofertaExtractor primește text, dar PNG-urile nu trec prin OCR pipeline |
| G2 | **DOC format**: extractTextFromDOCX funcționează doar cu .docx, nu cu .doc legacy |
| G3 | **Lipsă extractori** pentru: act_constitutiv, statut, carte_identitate, diploma_studii, descriere_proiect |
| G4 | **No image pipeline**: processClientDoc nu procesează imagini (PNG/JPG) deloc |

---

## FLOW-URI DE EXTRACȚIE (cum ajunge fiecare document)

```
Fișier → getFileBuffer() → extensie?
  .pdf → extractTextFromPDF() → text → classifyDocument() → runExtractor()
  .docx → extractTextFromDOCX() → text → classifyDocument() → runExtractor()
  .xlsx → extractTextFromXLSX() → text → classifyDocument() → runExtractor()
  .doc → ??? (Nu există extractTextFromDOC!)
  .png/.jpg → ??? (Nu există pipeline pentru imagini!)
```

### Pipeline OCR intern (extractPDFPages):
```
pagină PDF → get_text()
  text > 50 chars → text nativ ✅
  text < 50 chars → render 200 DPI → Claude Vision OCR → text ✅
  XFA → get_text() returnează placeholder → FALS POZITIV! ⚠️
```
