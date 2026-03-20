# Plan: Pre-eligibilitate pe Firmă + Eligibilitate în Proiect

## Obiectiv
Consultantul poate verifica pre-eligibilitatea unei firme **fără a crea un proiect** — selectează sesiunea de finanțare, sistemul face match `company data` vs `rules` din ghidul sesiunii. Rezultatul: în 2 secunde vede scorul de eligibilitate. Eligibilitatea existentă din proiect rămâne intactă.

## Arhitectura

### Flux Pre-eligibilitate (NOU)
```
Company Detail Page → Select Sesiune (picker Program→Măsură→Sesiune)
  → POST /api/companies/:id/pre-eligibility { sessionFolderId }
  → Backend:
    1. Găsește subfolder "ghiduri" din sesiune
    2. Extrage toate regulile din ghiduri
    3. Construiește companyData (ONRC + financials, identic cu checkEligibility)
    4. Evaluează DOAR regulile "fixed" (instant, fără AI)
    5. Opțional: evaluează și "interpreted" (cu AI, mai lent)
    6. Returnează rezultat { rules[], summary }
  → Frontend afișează rezultatul inline (nu se salvează în DB)
```

### Flux Eligibilitate Proiect (EXISTENT — neschimbat)
```
Project → checkEligibility() → salvează în project_eligibility
```

---

## Pași de implementare

### Pas 1: Backend — Serviciu pre-eligibilitate
**Fișier:** `apps/api/src/services/preEligibility.ts` (NOU)

Funcție: `checkPreEligibility(companyId, sessionFolderId, organizationId, options?)`

```typescript
interface PreEligibilityResult {
  rules: {
    id: string;
    type: 'fixed' | 'interpreted';
    description: string;
    category: string;
    status: 'passed' | 'failed' | 'pending' | 'not_applicable';
    notes: string;
    condition?: any;
    sourceDocument: { id: string; name: string };
  }[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    notApplicable: number;
    fixed: { total: number; passed: number; failed: number; pending: number };
    interpreted: { total: number; passed: number; failed: number; pending: number };
  };
  companyDataUsed: Record<string, any>; // ce date s-au folosit
}
```

Logica:
1. Load company + associates + financials (refolosesc din eligibility.ts)
2. Find ghiduri subfolder → documents → rules
3. Build companyData object (extract din eligibility.ts în funcție reutilizabilă)
4. Evaluate fixed rules (extract din eligibility.ts)
5. Opțional: evaluate interpreted rules (dacă `options.includeInterpreted = true`)
6. Return results (NU salvează în DB — e doar un check temporar)

**Refactor:** Extrag `buildCompanyData()` și `evaluateFixedRule()` din `eligibility.ts` în funcții reutilizabile.

### Pas 2: Backend — Route pre-eligibilitate
**Fișier:** `apps/api/src/routes/companies.ts` (adaug endpoint)

```
POST /api/companies/:id/pre-eligibility
Body: { sessionFolderId: string, includeInterpreted?: boolean }
Response: PreEligibilityResult
```

Validări:
- Company exists & belongs to org
- sessionFolderId is type="sesiune" & belongs to org
- Company not in stare="radiata"

### Pas 3: Backend — Route sesiuni disponibile
**Fișier:** `apps/api/src/routes/companies.ts` (adaug endpoint)

```
GET /api/sessions
Response: SessionInfo[] — lista sesiunilor cu Program→Măsură→Sesiune path
```

Returnează structura arborescentă: `{ id, name, programName, masuraName, sesiuneName, rulesCount }`

### Pas 4: Frontend — Componenta SessionPicker
**Fișier:** `apps/web/src/components/SessionPicker.tsx` (NOU)

Dropdown cu 3 nivele:
- Program → Măsură → Sesiune
- Afișează și count de reguli per sesiune
- Reutilizabil (va fi folosit și în crearea proiectului)

### Pas 5: Frontend — Tab/Secțiune Pre-eligibilitate pe Company Detail
**Fișier:** `apps/web/src/app/(app)/companies/[id]/page.tsx` (modificare)

Adaug un nou tab **"Pre-eligibilitate"** după tabul "Juridic":
- SessionPicker în header
- Buton "Verifică eligibilitate"
- Tabel cu rezultate (coloane: Regulă, Categorie, Status, Note)
- Summary card (passed/failed/pending)
- Toggle "Include reguli interpretate (AI)" — off by default (pt viteză)
- Rezultatele NU se persistă — sunt doar în state React

### Pas 6: Refactor eligibility.ts — Extrage funcții comune
**Fișier:** `apps/api/src/services/eligibility.ts` (modificare)

Extrag:
- `buildCompanyData(company, financials, projectElements?)` → reutilizabil
- `evaluateFixedRule(rule, companyData)` → reutilizabil
- `evaluateInterpretedRules(rules, companyData, company, financials, options?)` → reutilizabil

`checkEligibility()` din proiect va chema aceleași funcții, doar că:
- Include și projectElements în companyData
- Salvează rezultatele în DB (project_eligibility)

---

## Ce NU se schimbă
- Schema DB: nu adaug tabele noi (pre-eligibilitatea e efemeră, nu se persistă)
- Project eligibility flow: rămâne identic
- checkEligibility() din proiect: rămâne, dar internele sunt refactorizate în funcții comune

## Estimare complexitate
- **Pas 1+6** (refactor + serviciu): Principal — extrag logica existentă
- **Pas 2+3** (routes): Simplu — 2 endpoints noi
- **Pas 4+5** (frontend): Mediu — UI nou pe company detail + session picker
