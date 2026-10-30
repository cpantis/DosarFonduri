# AUDIT — ROOT CAUSE ANALYSIS, IMPACT & IMPLEMENTATION PLAN

**Data:** 2026-03-16 | **Fișiere auditate:** ~100+ | **Probleme:** ~180

---

## PARTEA I — ROOT CAUSE ANALYSIS (Cum am ajuns aici?)

### Cauza #1: Dezvoltare rapidă fără security review
**Simptom:** 10 rute provider fără scoping, mass assignment pe 4 rute, `Function()` eval
**Explicație:** Rutele provider au fost implementate cu logica "provider authenticated = trusted". Modelul multi-tenant (provider A vs provider B) nu a fost gândit de la design — `cabinet_codes.createdBy` există dar nu e folosit niciodată în WHERE clauses. Fiecare rută face `SELECT * FROM table` fără filtrare.

### Cauza #2: Schema-first fără migration-tracking
**Simptom:** 3 tabele în schema.ts care nu există în DB, migrații care fac ALTER pe tabele inexistente
**Explicație:** `schema.ts` a fost tratat ca "source of truth" dar migrațiile nu au fost generate automat din el. Tabelele `element_rule_links`, `guide_reference_tables`, `rule_reference_links` au fost adăugate în schema.ts dar nimeni nu a creat migrația SQL corespunzătoare. Migrațiile 0011, 0017, 0018 fac ALTER/DELETE pe `element_rule_links` — dar tabelul nu există. Erorile sunt înghițite de logica din `migrate.ts` (lines 91-94) care face `catch` pe "already exists".

### Cauza #3: Lipsa unui pattern de validare consistent
**Simptom:** ~8% din rute au validare Zod, restul de 92% acceptă orice body
**Explicație:** `packages/shared/src/validators.ts` conține 6 scheme Zod dar sunt folosite doar în 1-2 locuri. Fiecare rută re-inventează (sau nu) validarea. Nu există un middleware Hono care să aplice automat schema de validare. Rezultat: `...body` spread direct în `db.update().set()` pe templates.ts:62 și rules.ts:38.

### Cauza #4: Error handling "optimist"
**Simptom:** 76 de `.catch(() => {})` goale, 220+ rute fără try-catch, 6 fișiere de rute cu 0 try-catch
**Explicație:** Pattern-ul dominant e "happy path only". Job processors (processTemplate, processGuide, processClientDoc) au 47 de fire-and-forget catches — audit logging și event publishing eșuează silent. Frontend-ul are 19 catch-uri goale — user-ul vede date goale fără niciun mesaj de eroare. Rute critice ca neemia.ts (21 de rute, 0 try-catch) și dashboard.ts (35 queries, 0 error handling) pot crasha serverul pe orice eroare DB.

### Cauza #5: Lipsa testelor
**Simptom:** Niciun test unit/integration în codebase
**Explicație:** Fără teste, regressions și security gaps trec neobservate. Mass assignment, missing ownership checks, stale closures — toate ar fi fost detectate de teste automate.

### Cauza #6: Fișiere monolitice
**Simptom:** `projects/[id]/page.tsx` ~1500 linii, `companies/[id]/page.tsx` ~61KB, `provider/dashboard.tsx` ~54KB
**Explicație:** Toată logica unei pagini (state, API calls, rendering, sub-componente) e într-un singur fișier. ProjectView are ~50 useState hooks. Imposibil de auditat, testat, sau refactorizat incremental.

---

## PARTEA II — IMPACT ANALYSIS (Ce fișiere sunt afectate?)

### TIER 1: SECURITATE CRITICĂ (13 fișiere)

```
apps/api/src/routes/provider.ts          ← 10 rute fără scoping (CRITICAL)
apps/api/src/routes/templates.ts         ← Mass assignment line 62 (CRITICAL)
apps/api/src/routes/rules.ts             ← Mass assignment line 38 (CRITICAL)
apps/api/src/services/scoring.ts         ← Function() eval line 168 (CRITICAL)
apps/api/src/jobs/processTemplate.ts     ← Shell injection line 102 (HIGH)
apps/api/src/routes/config.ts            ← SSRF line 232 (HIGH)
apps/api/src/routes/admin.ts             ← XSS în email line 128, password hash leak 191 (HIGH)
apps/api/src/routes/export.ts            ← CSV injection lines 90-139, cross-org data leak line 73 (HIGH)
apps/api/src/routes/projects.ts          ← Ownership gaps lines 396-512, lock bypass 860 (HIGH)
apps/api/src/routes/documents.ts         ← Element ownership gap line 798 (HIGH)
apps/api/src/db/migrate.ts               ← Hardcoded credentials lines 110, 137-138 (CRITICAL)
apps/web/src/lib/api.ts                  ← Token în localStorage line 28 (HIGH)
apps/web/src/lib/auth.ts                 ← No token expiry validation (HIGH)
```

### TIER 2: DATA INTEGRITY (8 fișiere)

```
apps/api/src/db/schema.ts                ← 3 tabele fără migrație, 7 FK cascade drift
apps/api/src/db/migrations/              ← Migrații 0011/0017/0018 referă tabele inexistente
apps/api/src/routes/auth.ts              ← Signup fără tranzacție (org + user + config = 3 INSERT-uri separate)
apps/api/src/routes/companies.ts         ← Company creation fără tranzacție
apps/api/src/services/onrc.ts            ← Fără timeout pe fetch extern
apps/api/src/services/email.ts           ← Fără timeout, erori înghițite
packages/shared/src/types.ts             ← 4 enum-uri out-of-date
packages/shared/src/validators.ts        ← Nefolosite pe 92% din rute
```

### TIER 3: RELIABILITY (20+ fișiere)

```
# Routes fără error handling (6 fișiere, 0 try-catch):
apps/api/src/routes/neemia.ts            ← 21 rute, 0 try-catch
apps/api/src/routes/dashboard.ts         ← 35 queries, 0 error handling
apps/api/src/routes/reference-tables.ts  ← 20+ rute, 0 try-catch
apps/api/src/routes/rules.ts             ← 3 rute, 0 try-catch
apps/api/src/routes/templates.ts         ← 5 rute, 0 try-catch
apps/api/src/routes/export.ts            ← 3 rute, 0 try-catch

# Jobs cu fire-and-forget (47 catches goale):
apps/api/src/jobs/processTemplate.ts     ← 9 .catch(() => {})
apps/api/src/jobs/processGuide.ts        ← 10 .catch(() => {})
apps/api/src/jobs/processClientDoc.ts    ← 9 .catch(() => {})
apps/api/src/jobs/processCompany.ts      ← 7 .catch(() => {})

# Race conditions:
apps/api/src/services/ocr.ts             ← nextBatch++ non-atomic line 438
apps/api/src/jobs/processGuide.ts        ← nextChunk++ non-atomic line 964
apps/api/src/services/genericExtractor.ts ← nextBatch++ non-atomic line 198

# N+1 queries:
apps/api/src/routes/projects.ts          ← ~8 queries/proiect la listare
apps/api/src/routes/dashboard.ts         ← ~35 queries per request
apps/api/src/services/solomon.ts         ← Per-element DB lookups line 1392
apps/api/src/services/projectLearning.ts ← N+1 în 5 locuri
apps/api/src/services/budgetValidation.ts ← N+1 în 3 locuri
```

### TIER 4: FRONTEND QUALITY (15+ fișiere)

```
# Fișiere monolitice:
apps/web/src/app/(app)/projects/[id]/page.tsx    ← ~1500 linii, ~50 useState
apps/web/src/app/(app)/companies/[id]/page.tsx   ← ~61KB
apps/web/src/app/provider/dashboard/page.tsx     ← ~54KB

# Error handling lipsă:
apps/web/src/app/(app)/dashboard/page.tsx        ← .catch(() => {}) silent
apps/web/src/app/(app)/companies/page.tsx        ← 4 catch-uri goale
apps/web/src/app/(app)/projects/page.tsx         ← .catch(() => setX([]))
apps/web/src/app/(app)/admin/page.tsx            ← 3 catch-uri goale

# Hooks cu bugs:
apps/web/src/hooks/useSSE.ts                     ← Stale closures, setTimeout fără cleanup
apps/web/src/hooks/useSWRApi.ts                  ← No AbortController cleanup
apps/web/src/hooks/useOptimistic.ts              ← Stale data în closure

# Auth/UX:
apps/web/src/app/(app)/layout.tsx                ← Auth guard doar client-side
apps/web/src/app/(app)/admin/page.tsx            ← Admin check doar client-side
apps/web/src/components/layout/Sidebar.tsx       ← Admin link vizibil tuturor
apps/web/src/components/layout/ThemeProvider.tsx  ← Dark theme neimplementat
```

### HARTA DEPENDENȚELOR

```
                    ┌──────────────────────────┐
                    │      schema.ts           │ ← 3 tabele lipsă
                    │   (source of truth)      │ ← 7 FK cascade drift
                    └─────────┬────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────┐    ┌──────────┐    ┌──────────┐
      │ migrate.ts│    │ routes/* │    │ services │
      │ (broken) │    │(no valid)│    │(no txn)  │
      └──────────┘    └────┬─────┘    └────┬─────┘
                           │               │
                    ┌──────┴───────────────┴──────┐
                    │        provider.ts           │
                    │   (0 scoping, 10 vulns)      │
                    └──────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────┐    ┌──────────┐    ┌──────────┐
      │ web/lib  │    │ hooks/*  │    │ pages/*  │
      │(token LS)│    │(stale cb)│    │(no err)  │
      └──────────┘    └──────────┘    └──────────┘
```

---

## PARTEA III — IMPLEMENTATION PLAN

### SPRINT 0: Securitate critică (estimat: cel mai urgent)

**Obiectiv:** Elimină toate vulnerabilitățile CRITICAL și HIGH de securitate.

#### Task 0.1: Provider route scoping
**Fișier:** `apps/api/src/routes/provider.ts`
**Ce:** Adaugă filtrare `createdBy = providerId` pe TOATE rutele.
**Cum:**
1. GET /cabinets → `WHERE cabinet_codes.createdBy = providerId` (JOIN pe cabinet_codes)
2. PUT/DELETE /cabinets/:id → verifică ownership prin cabinet_codes
3. GET /users → filtrează useri din cabinetele proprii
4. DELETE /users/:id → verifică user aparține cabinetelor proprii
5. GET /revenue → calculează doar pentru cabinetele proprii
6. POST /cabinets/:id/access → verifică ownership înainte de JWT generation
7. POST /cabinets/:id/email → verifică ownership
8. DELETE /codes/:id, POST /codes/:id/toggle → `WHERE createdBy = providerId`

#### Task 0.2: Mass assignment fix
**Fișiere:** `templates.ts:62`, `rules.ts:38`
**Ce:** Înlocuiește `...body` spread cu whitelist explicită.
**Cum:**
```typescript
// BEFORE (vulnerable)
.set({ ...body, validatedBy: body.validated ? auth.userId : null })

// AFTER (safe)
.set({
  label: body.label,
  fieldValue: body.fieldValue,
  validated: body.validated,
  validatedBy: body.validated ? auth.userId : null,
})
```

#### Task 0.3: Function() eval sandbox
**Fișier:** `services/scoring.ts:168`
**Ce:** Înlocuiește `new Function()` cu evaluator safe.
**Cum:** Implementează un evaluator simplu care parseează doar operații aritmetice și comparații, fără acces la scope-ul JS.

#### Task 0.4: Shell injection fix
**Fișier:** `jobs/processTemplate.ts:102`
**Ce:** Înlocuiește `execSync(\`python3 ${path}\`)` cu `execFileSync('python3', [path])`.

#### Task 0.5: SSRF fix
**Fișier:** `routes/config.ts:232`
**Ce:** Validează URL-ul contra unei whitelist de domenii permise înainte de `fetch()`.

#### Task 0.6: XSS + CSV injection + data leaks
**Fișiere:** `admin.ts:128`, `export.ts:90-139`, `export.ts:73`
**Ce:**
- admin.ts: Escape HTML în org.name cu `escapeHtml()` utility
- export.ts: Prefix valori CSV cu `'` dacă încep cu `=+@-`
- export.ts: Adaugă `WHERE organizationId = auth.organizationId` pe toate queries

#### Task 0.7: Credențiale hardcodate
**Fișier:** `db/migrate.ts:110, 137-138`
**Ce:** Mută credențialele în env vars. Elimină fallback passwords din cod.

#### Task 0.8: Password hash leak
**Fișier:** `routes/admin.ts:191-197`
**Ce:** Exclude `passwordHash` din răspunsul PUT /users/:id.

---

### SPRINT 1: Data Integrity

**Obiectiv:** Schema-migration sync + tranzacții DB.

#### Task 1.1: Migration 0021 — Creează tabelele lipsă
**Fișier NOU:** `apps/api/src/db/migrations/0021_create_missing_tables.sql`
**Ce:** CREATE TABLE pentru `element_rule_links`, `guide_reference_tables`, `rule_reference_links` + enum-urile asociate.

#### Task 1.2: Migration 0022 — Fix FK cascade
**Fișier NOU:** `apps/api/src/db/migrations/0022_fix_fk_cascades.sql`
**Ce:** DROP + re-CREATE FK constraints cu `ON DELETE CASCADE` acolo unde schema.ts le definește.

#### Task 1.3: Fix migrate.ts execution logic
**Fișier:** `apps/api/src/db/migrate.ts`
**Ce:**
- Diferențiază erori "already exists" de "relation does not exist"
- Nu mai re-executa migrații 0004+ la fiecare startup
- Elimină credențialele hardcodate (Task 0.7)

#### Task 1.4: Tranzacții pe operații multi-table
**Fișiere:** `routes/auth.ts` (signup), `routes/companies.ts` (create), `routes/projects.ts` (create)
**Ce:** Wrap multi-INSERT operations în `db.transaction()`.

#### Task 1.5: Sync shared types
**Fișier:** `packages/shared/src/types.ts`
**Ce:** Adaugă valorile lipsă din enum-uri: `DocFileType`, `DocStatus`, `DocProcessingType`, `ElementSource`.

---

### SPRINT 2: Validation Layer

**Obiectiv:** Input validation consistent pe toate rutele.

#### Task 2.1: Validation middleware Hono
**Fișier NOU:** `apps/api/src/middleware/validate.ts`
**Ce:** Middleware generic care aplică Zod schema pe `c.req.json()` și returnează 400 cu detalii dacă validarea eșuează.
```typescript
export const validate = <T>(schema: ZodSchema<T>) => {
  return async (c: Context, next: Next) => {
    const body = await c.req.json();
    const result = schema.safeParse(body);
    if (!result.success) return c.json({ error: result.error.flatten() }, 400);
    c.set("validatedBody", result.data);
    await next();
  };
};
```

#### Task 2.2: Zod schemas pentru fiecare rută
**Fișier:** `packages/shared/src/validators.ts` (extins)
**Ce:** Schema Zod per domeniu: `updateTemplateElementSchema`, `updateRuleSchema`, `createProjectSchema`, etc.

#### Task 2.3: Aplică middleware pe toate rutele POST/PUT/PATCH
**Fișiere:** Toate cele 14 route files
**Ce:** Înlocuiește `c.req.json()` cu `c.get("validatedBody")` pe rutele protejate.

#### Task 2.4: Ownership verification middleware
**Fișier NOU:** `apps/api/src/middleware/ownership.ts`
**Ce:** Helper-e reutilizabile: `verifyDocumentOwnership()`, `verifyTemplateOwnership()`, `verifyRuleOwnership()` — similar cu `verifyProjectOwnership()` existent.

---

### SPRINT 3: Error Handling

**Obiectiv:** Nicio eroare nu mai e înghițită silent.

#### Task 3.1: Try-catch pe toate rutele
**Fișiere:** Cele 6 fișiere cu 0 try-catch + restul
**Ce:** Wrap fiecare route handler în try-catch cu error response standardizat:
```typescript
try { ... } catch (err) {
  console.error(`[${method} ${path}]`, err);
  return c.json({ error: "Internal server error" }, 500);
}
```

#### Task 3.2: Înlocuiește .catch(() => {}) cu logging
**Fișiere:** 76 instanțe (47 în jobs, 19 frontend, 10 routes)
**Ce:**
- Jobs: `.catch(err => console.error('[job:name] non-critical:', err.message))`
- Frontend: `.catch(err => console.warn('...', err))` + toast pentru operații vizibile user-ului
- Routes: `.catch(err => console.error('...', err))`

#### Task 3.3: Timeout pe fetch-uri externe
**Fișiere:** `services/email.ts`, `services/onrc.ts`
**Ce:** AbortController cu timeout 15s pe toate fetch-urile externe.

#### Task 3.4: Frontend error states
**Fișiere:** `dashboard/page.tsx`, `companies/page.tsx`, `projects/page.tsx`, `admin/page.tsx`
**Ce:** Adaugă `const [error, setError] = useState<string | null>(null)` + UI feedback (inline error message sau toast).

---

### SPRINT 4: Performance

**Obiectiv:** Elimină N+1 queries și race conditions.

#### Task 4.1: Batch queries pe project listing
**Fișier:** `routes/projects.ts:87-161`
**Ce:** Înlocuiește loop-ul cu 8 queries/proiect cu un singur query cu JOIN-uri sau subqueries `WHERE id IN (...)`.

#### Task 4.2: Dashboard query optimization
**Fișier:** `routes/dashboard.ts:40-82`
**Ce:** Combină cele ~35 queries în 5-6 queries agregate cu COUNT/SUM.

#### Task 4.3: Solomon batch element save
**Fișier:** `services/solomon.ts:1392-1488`
**Ce:** Colectează elementele și fă un singur `db.insert().values([...])` în loc de per-element INSERT.

#### Task 4.4: Fix race condition nextBatch++
**Fișiere:** `services/ocr.ts:438`, `jobs/processGuide.ts:964`, `services/genericExtractor.ts:198`
**Ce:** Înlocuiește `nextBatch++` cu queue-based dispatch (pre-assign batch ranges) sau mutex.

#### Task 4.5: Înlocuiește redis.keys() cu SCAN
**Fișiere:** Services care folosesc `redis.keys()`
**Ce:** `redis.keys('pattern*')` → `redis.scanStream({ match: 'pattern*' })` cu cursor iteration.

---

### SPRINT 5: Frontend Quality

**Obiectiv:** Fix hooks, accessibility, auth UX.

#### Task 5.1: Fix useSSE stale closures
**Fișier:** `hooks/useSSE.ts`
**Ce:** Adaugă `handleEvent` și `onEvent` în dependency array-ul `useCallback` pentru `connect`, sau folosește `useRef` pentru callbacks.

#### Task 5.2: Fix setTimeout cleanup
**Fișier:** `hooks/useSSE.ts:168, 199`
**Ce:** Store timeout IDs în ref și clearTimeout în useEffect cleanup.

#### Task 5.3: Admin nav visibility
**Fișier:** `components/layout/Sidebar.tsx:181-183`
**Ce:** Condiționează admin link de `user?.role === 'admin'`.

#### Task 5.4: ARIA attributes
**Fișiere:** `SlideOver.tsx`, `SplitPane.tsx`, `ProgressBar2.tsx`
**Ce:** Adaugă `role="dialog"`, `aria-modal`, `aria-valuenow/min/max`, keyboard handlers pe separator.

#### Task 5.5: AbortController cleanup pe useSWRApi
**Fișier:** `hooks/useSWRApi.ts`
**Ce:** Creează AbortController în useEffect, abort în cleanup function.

---

### SPRINT 6: Decompoziție (opțional, lower priority)

#### Task 6.1: Split ProjectView
**Fișier:** `projects/[id]/page.tsx` → componente separate:
- `ProjectSidebar.tsx` (tree nav)
- `EligibilitySection.tsx`
- `SolomonSection.tsx`
- `NeemiaSection.tsx`
- `ElementsSection.tsx`
- `ChecklistSection.tsx`
- `GuideSection.tsx`

#### Task 6.2: Split CompanyDetail
**Fișier:** `companies/[id]/page.tsx` → componente per tab.

#### Task 6.3: Split ProviderDashboard
**Fișier:** `provider/dashboard/page.tsx` → componente per secțiune.

---

## ORDINEA DE EXECUȚIE

```
SPRINT 0  ──→  SPRINT 1  ──→  SPRINT 2  ──→  SPRINT 3  ──→  SPRINT 4  ──→  SPRINT 5
(securitate)   (data)        (validare)      (erori)        (perf)          (frontend)
CRITIC         CRITIC         HIGH            HIGH           MEDIUM          MEDIUM
                                                                    └──→  SPRINT 6
                                                                          (refactor)
                                                                          LOW
```

**Sprint 0 trebuie făcut IMEDIAT** — vulnerabilitățile provider sunt exploatabile de orice provider autentificat.
