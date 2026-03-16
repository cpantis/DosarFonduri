# CLAUDE CODE — Document 2/3
# Backend Bugs: 19 FAIL + 24 WARN din Audit Integritate
# DosarFonduri v2

## Core Rules
- Read the file before answering. Never speculate about code you have not opened.
- Do not hard-code values. Implement the actual logic.
- Write high-quality, general-purpose solutions.
- Do not stop early due to token budget concerns.
- Context will be compacted automatically, continue working.

## REGULĂ FUNDAMENTALĂ
NU strică ce funcționează deja. Fiecare fix trebuie testat izolat.
Citește ÎNTREGUL fișier înainte de a edita — nu presupune structura.
După FIECARE fix: `bun run build` trebuie să treacă.
Commit SEPARAT per fix cu mesaj descriptiv.

## AI PROVIDER
Platforma folosește EXCLUSIV Anthropic (Claude).
Oriunde vezi referințe la OpenAI/GPT-4o în cod, înlocuiește cu 
Anthropic echivalent: Haiku pentru clasificare/OCR, Sonnet pentru 
extracție structurată, Opus+ET pentru raționament complex.
NU adăuga dependințe OpenAI.

---

## ORDINEA DE EXECUȚIE
Blockers (1-6) → Critical (7-11) → High (12-17) → Warnings (W1-W24)

═══════════════════════════════════════════════════════════════
BLOCKERS — Fără astea nu mergem în producție
═══════════════════════════════════════════════════════════════

### FIX 1 — Cache Redis cross-organizație (SECURITATE)
Fișier: services/onrc.ts (în jurul liniilor 106, 140)
BUG: Cache key `onrc:${cui}` nu include organizationId.
Org A cachează lookup CUI → Org B primește datele Org A.
FIX: Schimbă TOATE cache keys care conțin date per organizație 
să includă organizationId: `onrc:${organizationId}:${cui}`
Grep `redis.get(` și `redis.set(` în tot proiectul — verifică 
că nicio cheie cu date sensibile nu e partajată cross-org.
TEST: Două organizații cu firme diferite dar același CUI 
(teoric imposibil, dar cache-ul nu trebuie să leak).

---

### FIX 2 — Rules duplicate la re-procesare ghid
Fișier: jobs/processGuide.ts (în jurul liniilor 241-256)
BUG: scoringCriteria se șterg corect, dar rules NU se șterg 
la re-upload. Re-procesare = reguli duplicate în DB.
FIX: ÎNAINTE de inserare rules noi, adaugă:
```
await db.delete(rules)
  .where(and(
    eq(rules.documentId, guideDocId),
    eq(rules.organizationId, orgId)
  ));
```
Verifică ACELAȘI pattern pentru: elementDefinitions, 
elementRuleLinks, ruleReferenceLinks — TOATE trebuie șterse 
și recreate la re-procesare. Citește codul și verifică fiecare.
TEST: Uploadează ghid → procesează → re-uploadează același ghid → 
verifică în DB că nu sunt duplicate.

---

### FIX 3 — ELEMENTS_JSON silent fail în Solomon
Fișier: services/solomon.ts (în jurul liniilor 1339-1355)
BUG: Dacă Opus nu include `<!--ELEMENTS_JSON-->` sau JSON e 
malformat: catch {} silențios. Zero elemente salvate.
FIX:
- În catch: `logger.warn("ELEMENTS_JSON parse failed", { error, rawSnippet })`
- Trimite SSE event: `{ type: "extraction_warning", 
  message: "Nu am putut extrage date structurate din răspuns" }`
- Salvează mesajul conversațional oricum (e valid)
- NU crash-ui stream-ul — e warning, nu error
TEST: Trimite un mesaj la Solomon unde răspunsul probabil 
nu conține ELEMENTS_JSON (ex: "Bună ziua"). Verifică:
1) Mesajul apare normal 2) Nu apare eroare 3) Log-ul conține warning.

---

### FIX 4 — Timeout inexistent pe Opus streaming
Fișier: services/solomon.ts (în jurul liniei 1313)
BUG: `anthropic.messages.stream()` fără AbortController.
API hang → stream blocat infinit.
FIX: Adaugă AbortController cu timeout 120s:
```
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 120_000);
try {
  const stream = anthropic.messages.stream({...}, 
    { signal: controller.signal });
  // ... process stream
} finally {
  clearTimeout(timeout);
}
```
Verifică și endpoint-urile Neemia (generate, compose) — 
dacă au streaming, adaugă timeout și acolo.
TEST: Verifică că stream-ul se închide clean la timeout 
(nu crash, ci mesaj "Răspunsul a durat prea mult").

---

### FIX 5 — Fișier corupt crash-uiește stream-ul Solomon
Fișier: routes/solomon.ts (în jurul liniilor 132-140)
BUG: `extractTextFromPDF/DOCX/XLSX` fără try-catch per fișier.
Un fișier corupt din 5 → toate pierdute.
FIX: Wrap FIECARE extracție individual:
```
for (const file of files) {
  try {
    const text = await extractText(file.path);
    extracted.push({ name: file.name, text });
  } catch (err) {
    logger.warn("File extraction failed", { name: file.name, err });
    extracted.push({ name: file.name, 
      text: `[Fișier neprelucrabil: ${file.name}]` });
  }
}
```
TEST: Upload un fișier valid + un fișier corupt în Solomon.
Fișierul valid trebuie procesat, cel corupt ignorat cu mesaj.

---

### FIX 6 — 7 FK-uri fără ON DELETE CASCADE
Fișier: db/schema.ts (linii 102, 461, 474, 517, 660, 678)
BUG: Ștergere organizație/ghid/template blocată sau orfani.
FIX: Creează migrare care adaugă ON DELETE CASCADE pe:
1. companies.organizationId
2. projectEligibility.ruleId
3. projectDocuments.templateDocumentId
4. projectChecklist.templateId
5. solomonKnowledge.organizationId
6. apiIntegrations.organizationId
Grep `.references(` în schema.ts — verifică FIECARE referință 
că are comportament explicit (cascade/restrict/set null).
TEST: Creează organizație → adaugă firmă → șterge organizația → 
verifică că firma e ștearsă (cascade), nu eroare FK.

═══════════════════════════════════════════════════════════════
CRITICAL — Fix obligatoriu prima săptămână
═══════════════════════════════════════════════════════════════

### FIX 7 — CUI unique constraint violation
Fișier: jobs/processCompany.ts (în jurul liniei 78) + db/schema.ts:137
BUG: Update CUI din PROC-* la valoarea reală fără verificare duplicat.
FIX: Înainte de UPDATE, verifică existența:
```
const existing = await db.select().from(companies)
  .where(and(
    eq(companies.cui, realCui),
    eq(companies.organizationId, orgId),
    ne(companies.id, currentId)
  ));
if (existing.length > 0) {
  // Merge: actualizează recordul existent, șterge PROC-*
  // SAU: returnează eroare descriptivă
}
```

---

### FIX 8 — elementRuleLinks nu populează elementDefId
Fișier: jobs/processGuide.ts (în jurul liniilor 414-519)
BUG: Toate link-urile folosesc templateElementId, niciodată 
elementDefId. Arhitectura elementDefinitions e deconectată de reguli.
FIX: Citește cum se creează elementRuleLinks. După Faza 5 
(elementDefinitions create), fă lookup:
```
const elemDef = await db.select().from(elementDefinitions)
  .where(and(
    eq(elementDefinitions.elementKey, aliasOrKey),
    eq(elementDefinitions.organizationId, orgId)
  ));
if (elemDef.length > 0) {
  link.elementDefId = elemDef[0].id;
}
```
ATENȚIE: Dacă Faza 4 (linking) rulează ÎNAINTE de Faza 5 
(element definitions), mută linking-ul DUPĂ Faza 5 sau fă 
un second pass de actualizare elementDefId.

---

### FIX 9 — Template mapping fără backfill după ghid
Fișier: services/elementDefinitionService.ts (în jurul liniilor 243-244)
BUG: autoMapTemplatePlaceholders() rulează o singură dată la 
procesare template. Template uploadat ÎNAINTE de ghid → mapping gol permanent.
FIX: La FINALUL processGuide.ts (după Faza 5), adaugă:
```
// Backfill: re-map template-urile organizației
const templates = await db.select().from(documents)
  .where(and(
    eq(documents.organizationId, orgId),
    eq(documents.type, "template")
  ));
for (const tmpl of templates) {
  await autoMapTemplatePlaceholders(tmpl.id, orgId);
}
logger.info(`Backfill mapping: ${templates.length} template-uri`);
```

---

### FIX 10 — XFA fill neintegrat în Neemia
Fișier: services/neemia.ts + services/xfa_extract.py
BUG: fill_xfa_pdf() există în Python dar nu e apelat din Neemia.
FIX: În neemia.ts, funcția generateDocument(), adaugă branch PDF:
```
if (templateDoc.mimeType === "application/pdf") {
  if (templateDoc.hasXfaFields) {
    result = await callPythonService("fill_xfa_pdf", { 
      templatePath, elementsMap 
    });
  } else {
    logger.warn("PDF template without XFA fields", { templateId });
    // Returnează PDF nemodificat cu warning
  }
}
```
Citește xfa_extract.py pentru a înțelege interfața fill_xfa_pdf().

---

### FIX 11 — confirmed flag nu se resetează la update Solomon
Fișier: services/solomon.ts (în jurul liniilor 1397-1421)
BUG: La UPDATE element, confirmed rămâne true chiar dacă valoarea 
se schimbă. Date inconsistente.
FIX: Verifică logica de UPDATE. Trebuie să fie:
1. Dacă source === "consultant_manual" && confirmed === true → SKIP (nu modifica)
2. Altfel → UPDATE cu confirmed: false
```
.set({ 
  value: newValue, 
  source: "solomon_chat",
  confirmed: false,
  updatedAt: new Date() 
})
```

═══════════════════════════════════════════════════════════════
HIGH — Fix în sprint
═══════════════════════════════════════════════════════════════

### FIX 12 — PDF non-XFA template: zero câmpuri detectate
Fișier: jobs/processTemplate.ts (în jurul liniilor 322-340)
BUG: tryExtractXFA() returnează null, fără fallback.
FIX: Adaugă fallback la detecție vizuală (Claude Vision Haiku):
```
const xfaFields = await tryExtractXFA(pdfPath);
if (!xfaFields || xfaFields.length === 0) {
  logger.info("No XFA, falling back to visual detection (Claude Vision)");
  const visualFields = await detectFieldsVisually(pdfPath);
  return visualFields;
}
```

### FIX 13 — maxPoints salvat ca STRING
Fișier: jobs/processGuide.ts (în jurul liniei 290)
BUG: `maxPoints: String(c.maxPoints || 0)` — conversie la string.
FIX: `maxPoints: Number(c.maxPoints) || 0`
Migrare DB dacă coloana e text: ALTER TYPE numeric.
În scoring.ts: `const points = Number(criterion.maxPoints) || 0`

### FIX 14 — Imagini (JPG/PNG) crash la upload certificat
Fișier: jobs/processCompany.ts (în jurul liniilor 46-61)
BUG: extractTextFromPDF() apelat pe imagini → PyMuPDF crash.
FIX: Check mimeType:
```
if (mime.startsWith("image/")) {
  text = await extractTextFromImage(file.path); // Claude Vision Haiku
} else if (mime === "application/pdf") {
  text = await extractTextFromPDF(file.path);
} else if (mime.includes("docx")) {
  text = await extractTextFromDOCX(file.path);
}
```

### FIX 15 — API ListaFirme down = job crash
Fișier: services/onrc.ts (în jurul liniilor 123-146)
BUG: Fetch fail → eroare → firma nu se salvează.
FIX: Wrap în try-catch, salvează firma fără financials:
```
let financials = null;
try { financials = await fetchListaFirme(cui); } 
catch (err) { 
  logger.warn("ListaFirme unavailable", { cui }); 
}
await saveCompany({ ...onrcData, financials });
```

### FIX 16 — S3 upload fără error handling (Neemia)
Fișier: services/storage.ts + services/neemia.ts
BUG: uploadFile() fără try-catch. S3 fail → crash.
FIX: Wrap cu cleanup la DB fail:
```
let s3Key;
try { s3Key = await uploadFile(buffer, filename); }
catch { throw new Error("Upload document eșuat"); }
try { await db.insert(projectDocuments).values({ s3Key, ... }); }
catch (err) { 
  await deleteFile(s3Key).catch(() => {}); // cleanup
  throw err; 
}
```

### FIX 17 — section_type fără validare pe răspuns AI
Fișier: services/ocr.ts (în jurul liniei 397)
FIX: Validează contra enum:
```
const VALID = ["eligibility","scoring","financial","procedural",
  "documents","annexes","definitions","other"] as const;
const type = VALID.includes(raw.section_type) ? raw.section_type : "other";
```

═══════════════════════════════════════════════════════════════
WARNINGS — Toate 24
═══════════════════════════════════════════════════════════════

Fixează-le pe toate. Sunt rapide dar contează cumulat.

### FLOW 1 — Firme
W1.1: onrcParser.ts ~119-144 — Watermark cleaning pe TOATE paginile, nu doar prima
W1.2: onrcParser.ts ~650-652 — Validare: CUI AND Denumire obligatorii (nu OR)
W1.3: companyExtractor.ts ~214-261 — SSE event extraction_warning la parse fail
W1.4: processCompany.ts ~95 — Zod validation pe naturaCapital JSONB
W1.5: listafirme.ts ~179-181 — Defaults: cifraAfaceri ?? 0, profit ?? 0, nrAngajati ?? 0

### FLOW 2 — Ghid
W2.1: ocr.ts ~589-619 — Hard check chunk size: split dacă > OPUS_CHAR_LIMIT
W2.2: processGuide.ts ~253,271 — confidence: Number() nu String()
W2.3: processGuide.ts ~291 — Zod validation pe evaluationLogic JSONB
W2.4: processGuide.ts ~326-328 — Colectează upsert errors, log count, SSE warning
W2.5: elementDefinitionService.ts ~19 — Zod schema pe validationRules
W2.6: schema.ts ~355-367 — Adaugă guideDocumentId pe templatePlaceholderMapping
W2.7: processGuide.ts ~770-773 — Dedup vs DB: ON CONFLICT DO NOTHING
W2.8: processGuide.ts ~390-426 — UNIQUE constraint pe (ruleId, elementDefId)

### FLOW 3 — Template
W3.1: processTemplate.ts ~49 — Normalizare XML runs adiacente {{placeholder}}
W3.2: processTemplate.ts ~140-144 — Label: key.replace(/_/g," ").capitalize()
W3.3: elementDefinitionService.ts ~258 — confidence = Number() || 0.85
W3.4: processTemplate.ts ~382-394 — Log + SSE la vision failure
W3.5: processTemplate.ts ~467 — Log warning compose PDF nesuportat

### FLOW 4 — Solomon
W4.1: solomon.ts ~255 — Reference tables: crește la 200 rows
W4.2: solomon.ts ~1349 — Confidence: Math.max(0, Math.min(1, Number()))
W4.3: solomon.ts ~194 — Filtrează elementDefinitions per guideDocumentId
W4.4: eligibility.ts ~104-107 — Citește din projectElements, nu companyData
W4.5: solomon.ts ~320 — Knowledge: crește cap la 100 sau elimină

### FLOW 5 — Neemia
W5.1: neemia.ts ~131 (Python) — Formatare RO: 125.5 → "125,5"
W5.2: xfa_extract.py ~148-150 — Returnează warning JSON la PDF non-XFA
W5.3: neemia.ts ~61 — Elimină dead code `&& false` din PATH 2

### FLOW 6 — Cross-cutting
W6.1+W6.2: processClientDoc.ts + solomon.ts — Redis lock per projectId
W6.3: lib/queue.ts — BullMQ jobId unic: `${queueName}:${documentId}`
W6.4: jobs/worker.ts ~20-42 — Cron: attempts:3, backoff exponential
W6.5: routes/documents.ts — Redis ping check înainte de enqueue
W6.6: schema.ts ~457,355 — Adaugă organizationId pe projectEligibility + templatePlaceholderMapping

---

## VERIFICARE FINALĂ DOCUMENT 2

1. `bun run build` — zero erori
2. `bun run db:push` — migrări aplicate
3. Grep "catch {}" sau "catch (e) {}" — zero catch-uri goale
4. Grep "console.warn" — niciun error swallowed
5. Testează mental fiecare flow:
   - Firmă nouă (PDF + imagine + API down)
   - Ghid procesat + re-procesat (zero duplicate)
   - Template uploadat înainte și după ghid
   - Solomon: mesaj simplu + cu fișiere + timeout
   - Neemia: FILL DOCX + FILL PDF XFA + COMPOSE
6. Commit per fix, apoi tag final: "fix: all 19 FAIL + 24 WARN"
