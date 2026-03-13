# AUDIT REGULI END-TO-END
# De la ghid până la Solomon și Neemia
# Data: 2026-03-13

---

## REGULA TRASATĂ: EG1
**"Solicitantul trebuie să se încadreze în categoria beneficiarilor eligibili"**

---

## ETAPA A: EXTRAGERE REGULI DIN GHID — ⚠️ PARȚIAL

### Ce funcționează ✅
- `processGuide.ts` extrage corect 3 tipuri de reguli:
  - **Reguli fixe** (lines 120-235): condition={field, operator, value}, salvate în `rules`
  - **Reguli interpretate** (lines 260-401): decision trees via Opus+ET, salvate în `rules`
  - **Criterii de scorare** (lines 420-545): evaluationLogic={type, ranges, formula}, salvate în `scoringCriteria`
- Chunking funcțional pentru ghiduri >80KB (15 pagini/chunk)
- Deduplicare reguli cross-chunk
- SSE `job_progress` la fiecare fază
- Regula EG1 ar fi extrasă ca tip `fixed` cu condition: `{field: "forma_juridica", operator: "in", value: ["SRL","SA","PFA",...]}`

### Ce lipsește 🔴
1. **`elementRuleLinks` NU SE POPULEAZĂ** — processGuide extrage reguli dar NU creează link-uri între reguli și templateElements
2. **`ruleReferenceLinks` NU SE POPULEAZĂ** — processGuide NU leagă regulile de tabelele de referință din anexe
3. **NU se generează element_definitions** — templateElements sunt populate DOAR de processTemplate (din {{placeholders}}/XFA), nu din ghid

### Impact
- Regulile există izolat în tabela `rules`
- Nu există conexiune automată: regulă → element → tabel de referință
- Link-urile pot fi create DOAR manual via `POST /api/element-rule-links` și `POST /api/rule-reference-links` (reference-tables.ts:298, 207)

### Fișiere relevante
- `apps/api/src/jobs/processGuide.ts` — extragere (lines 120-545)
- `apps/api/src/routes/reference-tables.ts` — API manual pentru link-uri (lines 207-327)
- `apps/api/src/db/schema.ts` — tabelele elementRuleLinks, ruleReferenceLinks

---

## ETAPA B: REGULILE AJUNG ÎN SOLOMON? — ⚠️ PARȚIAL

### Ce funcționează ✅
- `buildSystemPrompt()` (solomon.ts:171-812) injectează regulile în system prompt
- Regulile sunt categorizate: passed/failed/pending pe baza `projectEligibility`
- Company data injectat: formă juridică, CUI, județ, financiare
- Regula EG1 ar apărea în secțiunea `REGULI DE ELIGIBILITATE` cu status pass/fail/pending
- Elemente goale vs completate listate explicit → Solomon știe ce trebuie colectat

### Ce lipsește ⚠️
1. **Solomon nu are element_definitions structurate** — nu știe CE câmpuri trebuie să colecteze din ghid, se bazează pe templateElements care vin din template (nu din regulile ghidului)
2. **Elementele listate vin doar din templateElements** — dacă un template nu are {{forma_juridica}}, Solomon nu va încerca să colecteze această valoare
3. **Nu există mapare structurată regulă→element** — Solomon primește regulile ca text, dar NU știe care element satisface care regulă

### Cum funcționează de facto
Solomon primește regulile ca text pur în prompt și se bazează pe **inferența AI** pentru a decide ce informații să colecteze. Funcționează suficient de bine pentru modele capabile (Opus), dar:
- Nu e determinist
- Nu garantează acoperirea tuturor regulilor
- Depinde de calitatea promptului, nu de structura datelor

### Fișiere relevante
- `apps/api/src/services/solomon.ts` — buildSystemPrompt (lines 171-812), element extraction (lines 1150-1330)

---

## ETAPA C: REGULILE AJUNG ÎN VALIDARE? — ❌ RUPT

### Ce funcționează ✅
- `validateElement()` are 4 layere de validare:
  1. Type check (string→number, date format)
  2. Reference table lookup (via link chain)
  3. Cross-element checks (hardcoded business rules)
  4. Rule-based validation (via elementRuleLinks → ruleReferenceLinks → guideReferenceTables)
- `checkEligibility()` evaluează reguli fixe contra company data — funcțional ✅
- `computeProjectScores()` calculează scoruri din `scoringCriteria` — funcțional ✅

### Ce e rupt ❌
1. **Layer 4 (rule-based validation) e mort** — `validateAgainstRules()` (elementValidation.ts:310-378):
   - Interogă `elementRuleLinks` care sunt **GOALE** (nimeni nu le populează automat)
   - Returnează `[]` (array gol) → elementul trece validarea fără rule checks
   - Reference table lookups nu se execută niciodată
2. **Regula EG1 NU ajunge la validarea elementelor** — eligibilitate evaluată doar la nivel de companie, nu per element

### Cascada funcționează DACĂ ar exista link-uri
```
elementRuleLinks (templateElementId → ruleId)
    ↓
rules (id, description, type, condition)
    ↓
ruleReferenceLinks (ruleId → referenceTableId)
    ↓
guideReferenceTables (id, data, lookupKey)
    ↓
performLookup(value, refTable) → matched/not
```
Dar primul pas (elementRuleLinks) returnează mereu `[]`.

### Fișiere relevante
- `apps/api/src/services/elementValidation.ts` — validateAgainstRules (lines 310-378)
- `apps/api/src/services/eligibility.ts` — checkEligibility (evaluare la nivel company)
- `apps/api/src/services/scoring.ts` — computeProjectScores

---

## ETAPA D: REGULILE AJUNG ÎN NEEMIA? — ⚠️ PARȚIAL

### Ce funcționează ✅
- `neemiaCompose.ts:149-151` — încarcă regulile direct din tabela `rules` (by organizationId)
- `neemiaCompose.ts:144-146` — încarcă `guideReferenceTables` direct
- FILL mode (`neemia.ts`) — mapează projectElements → {{placeholders}} → document generat
- COMPOSE mode — AI generează narativ + tabele folosind context (elements + rules + refTables)

### Ce lipsește ⚠️
1. **Regulile ajung NEFILTRATE** — `orgRules.slice(0, 50)` ia primele 50 reguli ale organizației, nu cele relevante pentru documentul curent
2. **Nu folosește elementRuleLinks** — nu știe care reguli se aplică la care elemente din template
3. **Reference tables parțial filtrate** — folosește `composeConfig.referenceTableIds` dacă există, altfel trimite TOATE tabelele

### Impactul real
- Neemia funcționează acceptabil pentru că AI-ul (Opus/Sonnet) face inferența din context
- Dar cu 50+ reguli nefiltrate, calitatea output-ului poate scădea
- Documentele generate pot omite reguli relevante sau include reguli irelevante

### Fișiere relevante
- `apps/api/src/services/neemiaCompose.ts` — buildComposeContext (lines 100-195)
- `apps/api/src/services/neemia.ts` — FILL mode

---

## ETAPA E: TEST END-TO-END — ❌ NU SE POATE TESTA

### Motivul
- Fără link-uri populate (elementRuleLinks, ruleReferenceLinks), cascada:
  `ghid → regulă → element → validare → lookup → scor`
  se întrerupe la primul pas.
- Regula EG1 ar fi extrasă corect din ghid, dar nu ar fi legată de niciun element.
- Un element "forma_juridica" completat de Solomon nu ar fi validat contra regulii EG1.

---

## REZUMAT STATUSURI

| Etapă | Status | Detalii |
|-------|--------|---------|
| **A — Extragere** | ⚠️ PARȚIAL | Reguli extrase OK, dar link-uri NU se creează |
| **B — Solomon** | ⚠️ PARȚIAL | Reguli în prompt, dar fără mapare structurată |
| **C — Validare** | ❌ RUPT | Layer 4 mort — elementRuleLinks goale |
| **D — Neemia** | ⚠️ PARȚIAL | Reguli ajung nefiltrate, funcționează prin inferență AI |
| **E — End-to-end** | ❌ NETESTABIL | Cascada întreruptă la link-uri |

---

## GAP CRITIC IDENTIFICAT

**Linking-ul automat regulă↔element↔tabel de referință lipsește complet.**

`processGuide.ts` extrage reguli și le salvează în `rules`, dar NU:
- Creează `elementRuleLinks` (regulă → templateElement)
- Creează `ruleReferenceLinks` (regulă → guideReferenceTable)

Aceste link-uri pot fi create doar manual via API REST, dar:
- Nu există UI pentru crearea lor
- Nu există automatizare la procesarea ghidului
- Fără ele, element validation Layer 4 și reference table lookups sunt moarte

---

## PLAN DE FIX (ordinea: A → C → B → D → E)

### FIX A: Auto-populare link-uri la procesarea ghidului
**Fișier:** `apps/api/src/jobs/processGuide.ts`

După extragerea regulilor, adaugă o fază nouă care:
1. Încarcă toate `templateElements` din aceeași organizație
2. Pentru fiecare regulă fixă cu `condition.field`, caută templateElements cu `key` matching
3. Creează `elementRuleLinks` pentru fiecare match
4. Pentru regulile care referențiază tabele din anexe, caută `guideReferenceTables` cu text similar
5. Creează `ruleReferenceLinks` pentru fiecare match

### FIX C: Validare graciloasă când nu există link-uri
**Fișier:** `apps/api/src/services/elementValidation.ts`

- Dacă `elementRuleLinks` e gol pentru un element, face fallback pe căutare directă în `rules` by condition.field matching element key
- Log warning când lipsesc link-uri (pentru debugging)

### FIX B: Solomon primește maparea element→regulă
**Fișier:** `apps/api/src/services/solomon.ts`

- În `buildSystemPrompt()`, adaugă secțiune cu maparea: "Element X este legat de Regula Y"
- Dacă elementRuleLinks există, le folosește; dacă nu, face text matching

### FIX D: Neemia filtrează regulile relevant
**Fișier:** `apps/api/src/services/neemiaCompose.ts`

- Folosește `elementRuleLinks` pentru a filtra regulile relevante pentru template-ul curent
- Fallback pe toate regulile dacă nu există link-uri

### FIX E: Re-test
- Verifică cascada completă cu date reale
