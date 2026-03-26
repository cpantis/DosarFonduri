# Pipeline Extragere Ghid v2 — Etapizat cu Prompt Caching

## Principiu
Ghidul se citește O SINGURĂ DATĂ (cache write), apoi 6 apeluri paralele extrag fiecare categorie
cu mindset de consultant focusat. Zero pierderi, zero truncări, ~4× mai rapid.

## Mindset comun (system prompt identic pe toate apelurile)
```
Ești Solomon — consultant senior cu 15+ ani experiență în fonduri europene.
Citești ghidul ca un consultant care își riscă reputația.
O regulă omisă = un dosar respins. O excepție nedetectată = o contestație pierdută.
```

## Cele 6 apeluri

### Apel 1 — REGULI FIXE
**Mindset:** Evaluator administrativ — "Ce respinge dosarul INSTANT?"
**Input:** System prompt + text ghid (CACHE WRITE) + instrucțiuni reguli fixe
**Output JSON:**
```json
{
  "fixed_rules": [{
    "category": "eligibilitate|financiar|tehnic|administrativ|achizitii|documente",
    "description": "Descriere clară a regulii",
    "condition": {
      "field": "cheia canonică SAU cheie nouă snake_case",
      "operator": "eq|neq|gt|gte|lt|lte|in|not_in|between",
      "value": "valoarea de comparare",
      "value2": "pentru between (opțional)"
    },
    "semantic_tags": ["THRESHOLD", "EXCLUSION", ...],
    "source_page": number,
    "source_text": "textul exact din ghid",
    "confidence": 0.0-1.0
  }]
}
```
**Ce extrage:** Plafoane, forme juridice, CAEN-uri, vechime, zone, praguri achiziții,
cheltuieli eligibile/neeligibile, TVA, deadline-uri.
**Regulile ELIMINATORII → confidence ≥ 0.95.**
**Referințe la anexe → menționează în source_text.**

### Apel 2 — REGULI INTERPRETATE (cu Extended Thinking)
**Mindset:** Consultant care a pierdut dosare din cauza excepțiilor nedetectate
**Input:** System prompt + text ghid (CACHE READ) + instrucțiuni reguli interpretate
**Output JSON:**
```json
{
  "interpreted_rules": [{
    "category": "selectie|intensitate|eligibilitate_complexa|documentare|achizitii|ajutor_stat",
    "description": "Descriere detaliată",
    "condition": {
      "type": "decision_tree|scoring|cumulative|conditional",
      "logic": "descriere structurată a logicii",
      "factors": ["factor1", "factor2"],
      "outcomes": [{"if": "condiție", "then": "rezultat"}]
    },
    "semantic_tags": ["PROPORTIONAL", "CLASSIFICATION", ...],
    "source_page": number,
    "source_text": "textul exact din ghid",
    "confidence": 0.0-1.0,
    "needs_review": true/false,
    "review_reason": "de ce necesită verificare umană"
  }]
}
```
**Ce extrage:** Intensitate sprijin, excepții, cazuri speciale, ajutor de stat/de minimis,
achiziții cu praguri cascadate. TOATE ramurile decision tree.
**needs_review=true dacă regulă ambiguă + review_reason.**

### Apel 3 — CRITERII DE SELECȚIE / SCORING
**Mindset:** Evaluator tehnic care completează grila de punctaj
**Input:** System prompt + text ghid (CACHE READ) + instrucțiuni scoring
**Output JSON:**
```json
{
  "scoring_criteria": [{
    "code": "codul criteriului (CS1, C1, P1, 1.1)",
    "name": "numele criteriului",
    "description": "descriere detaliată",
    "maxPoints": number,
    "category": "tehnic|financiar|management|relevant|sustenabilitate",
    "sourcePage": number,
    "evaluationLogic": {
      "type": "lookup|range|boolean|formula",
      "elementKey": "cheia câmpului de evaluat",
      "ranges": [{"min": number, "max": number, "points": number}],
      "formula": "expresie matematică (opțional)",
      "lookupColumn": "coloana punctaj din tabel (opțional)"
    }
  }]
}
```
**Ce extrage:** Cod, nume, punctaj maxim per criteriu, logica de evaluare completă.
**Capturează TOATĂ structura tabelelor de punctaj (toate intervalele/pragurile).**

### Apel 4 — DEFINIȚII ELEMENTE
**Mindset:** Consultant care pregătește dosarul — "Ce date îi trebuie?"
**Input:** System prompt + text ghid (CACHE READ) + regulile + scoringul extras (din apelurile 1-3) + instrucțiuni elemente
**Output JSON:**
```json
{
  "element_definitions": [{
    "element_key": "snake_case_key",
    "display_name": "Numele vizibil pentru consultant",
    "category": "beneficiary|farm|investment|location|financial|legal|technical|other",
    "data_type": "number|text|enum|boolean|date|document_ref|list_items",
    "unit": "unitate sau null",
    "enum_values": ["val1", "val2"] sau null,
    "required": true/false,
    "help_text": "text ajutător scurt",
    "is_derived": true/false,
    "derivation_formula": "formula sau null",
    "source_priority": ["document_extracted", "solomon_chat", "consultant_manual"],
    "collection_order": number,
    "min_count": 1,
    "max_count": null
  }]
}
```
**METODA OBLIGATORIE (pas cu pas):**
- Pentru FIECARE regulă fixă → ce câmp verifică? → element
- Pentru FIECARE regulă interpretată → ce factori intră în arbore? → element per factor
- Pentru FIECARE criteriu scoring → ce date se evaluează? → element
- NU se limitează la lista predefinită — creează chei noi specifice programului
- CARDINALITATE: "3 oferte" → min_count=3

### Apel 5 — DOCUMENTE NECESARE (checklist complet)
**Mindset:** "Un document lipsă = dosar respins administrativ"
**Input:** System prompt + text ghid (CACHE READ) + instrucțiuni documente
**Output JSON:**
```json
{
  "document_requirements": [{
    "name": "Numele documentului (ex: Certificat constatator ONRC)",
    "category": "juridice|financiare|tehnice|declaratii|oferte|anexe|altele",
    "required": true/false,
    "description": "Detalii: format cerut, termen valabilitate, cine emite",
    "format": "PDF|DOCX|XLSX|original|copie_conforma|orice",
    "source_page": number sau null,
    "conditions": "Condiții speciale (ex: doar pentru SRL, doar dacă valoare > 100.000 EUR) sau null"
  }]
}
```
**Ce extrage:** TOATE documentele de depus din:
- Secțiunea "Documente necesare" / "Conținut dosar" / "Lista documentelor"
- Tabelul/grila documentelor din ghid sau anexe
- Mențiuni dispersate ("va prezenta", "va anexa", "se va depune")
- Documente implicate de reguli (dacă certificat fiscal necesar → "Certificat fiscal ANAF")
**FIECARE document separat** (nu grupat).

### Apel 6 — TABELE DE REFERINȚĂ
**Mindset:** "Fiecare tabel din ghid e o sursă de validare"
**Input:** System prompt + text ghid (CACHE READ) + instrucțiuni tabele
**Output JSON:**
```json
{
  "tables": [{
    "name": "Numele tabelului",
    "description": "Ce conține și la ce se folosește",
    "table_type": "eligibility|scoring|reference|classification",
    "source_page": number,
    "schema": [{"key": "col_key", "label": "Coloana vizibilă", "type": "text|number"}],
    "data": [{"col_key": "valoare", ...}],
    "lookup_key": "coloana principală de căutare"
  }]
}
```
**Ce extrage:** Liste CAEN eligibile, coeficienți SO, zone ANC, tabele intensitate,
praguri de calitate pe luni, orice tabel structurat din ghid.

## Ordinea de execuție

```
FAZA 1 (paralel, CACHE WRITE pe primul apel):
  ├─ Apel 1: Reguli fixe
  ├─ Apel 2: Reguli interpretate + ET
  ├─ Apel 3: Scoring
  ├─ Apel 5: Documente necesare
  └─ Apel 6: Tabele de referință

FAZA 2 (secvențial, depinde de Faza 1):
  └─ Apel 4: Elemente (primește regulile + scoringul extras ca context)

FAZA 3 (fără AI):
  ├─ Dedup reguli + scoring + elemente + documente
  ├─ Save to DB
  ├─ Auto-link reguli ↔ elemente
  ├─ Auto-link reguli ↔ tabele referință
  └─ Auto-map template placeholders
```

## Estimare timp (ghid 62 pagini, 190K chars, 3 chunks)

### Per chunk:
| Apel | Output estimat | Timp (paralel) | Cache |
|------|---------------|----------------|-------|
| 1. Reguli fixe | ~3K tokens | ~40s | WRITE (primul) |
| 2. Interpretate + ET | ~5K tokens | ~45s | READ |
| 3. Scoring | ~3K tokens | ~15s | READ |
| 4. Elemente | ~2K tokens | ~10s | READ (Faza 2) |
| 5. Documente | ~2K tokens | ~10s | READ |
| 6. Tabele | ~3K tokens | ~20s | READ |
| **Paralel Faza 1** | | **~45s** | |
| **Faza 2** | | **~10s** | |
| **TOTAL per chunk** | | **~55s** | |

### Total (3 chunks paralel):
- Faza 1: ~45s (cel mai lung apel din cel mai mare chunk)
- Faza 2: ~10s (elemente cu context)
- Faza 3: ~5s (DB save + link)
- **TOTAL: ~60s (1 minut)**

vs acum: ~180-300s (3-5 minute)

## Prompt Caching — cum funcționează

```
Chunk 1, Apel 1: system_prompt + guide_text → CACHE WRITE (~15K tokens)
Chunk 1, Apel 2: system_prompt + guide_text → CACHE READ (instant)
Chunk 1, Apel 3: CACHE READ
Chunk 1, Apel 5: CACHE READ
Chunk 1, Apel 6: CACHE READ
Chunk 1, Apel 4: CACHE READ + reguli/scoring ca user message
```

Cache TTL: 5 minute. Toate apelurile pe același chunk se fac în < 1 minut → cache activ.

## Validare completitudine

După toate apelurile, verificăm:
1. Fiecare regulă fixă are cel puțin un element asociat (via condition.field)
2. Fiecare criteriu scoring are elementKey definit în element_definitions
3. Fiecare document din checklist are conditions mapate la reguli/elemente
4. Fiecare tabel are lookup_key valid
5. Trust score calculat din acoperirea categoriilor

## Ce NU se pierde (față de pipeline-ul actual)

| Categorie | Pipeline actual | Pipeline etapizat |
|-----------|----------------|-------------------|
| Reguli fixe | ✅ (dar pot fi truncate) | ✅ (output mic, zero truncări) |
| Reguli interpretate | ✅ (fără ET pe fixe) | ✅ (ET dedicat) |
| Scoring | ✅ | ✅ |
| Elemente | ⚠️ (pot fi omise din output mare) | ✅ (derivate din reguli+scoring) |
| Documente | ⚠️ (erau pierdute prin overwrite) | ✅ (apel dedicat) |
| Tabele | ✅ (Step 7 separat) | ✅ (integrat ca Apel 6) |
| Mindset consultant | ✅ | ✅ (per apel, mai focusat) |
