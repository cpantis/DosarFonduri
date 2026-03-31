# CLAUDE CODE — INSTRUCȚIUNI MASTER

## ⚠️ CITEȘTE ACEST FIȘIER PRIMUL

Acest proiect conține **specificații de implementare** + **prototipuri vizuale JSX** pentru platforma DosarFonduri.

## Structura proiectului

```
/apps/
  api/                           ← Backend Hono API
    src/
      db/                        ← Drizzle schema, migrations, seeds
        schema.ts                ← All DB tables (single file)
        migrations/              ← SQL migrations (0001–0017+)
        seed.ts, seed-demo.ts    ← Seed data
      routes/                    ← Hono route handlers (1 file per domain)
        auth.ts, companies.ts, projects.ts, documents.ts,
        solomon.ts, neemia.ts, templates.ts, rules.ts,
        reference-tables.ts, config.ts, admin.ts,
        dashboard.ts, provider.ts, export.ts
      services/                  ← Business logic + AI integrations
        solomon.ts, neemia.ts, neemiaCompose.ts,
        eligibility.ts, scoring.ts, ocr.ts, onrc.ts,
        storage.ts, xfaFiller.ts, email.ts,
        documentExtractor.ts, companyExtractor.ts,
        bilantParser.ts, listafirme.ts, ...
      middleware/                ← Auth, CORS, rate limiting
      jobs/                     ← BullMQ job processors
      lib/                      ← Shared utilities
      types/                    ← TypeScript types
      index.ts                  ← Hono app entry point
  web/                           ← Frontend Next.js 15 (App Router)
    src/
      app/
        (auth)/login/            ← Login page
        (app)/                   ← Protected routes (auth guard)
          layout.tsx             ← App shell: Sidebar + SSE provider
          dashboard/page.tsx     ← Panou de control
          companies/             ← Firme list + [id] detail
          projects/              ← Proiecte list + [id] ProjectView
          documents/             ← Documente + template/[id] viewer
          settings/page.tsx      ← Configurări
          admin/page.tsx         ← Admin (users, costs, audit)
        provider/                ← Provider-specific auth + dashboard
      components/
        layout/
          Sidebar.tsx            ← App sidebar (248px, nav sections)
          SplitPane.tsx          ← Draggable split pane
      hooks/
        useAuth.ts               ← Auth state + login/signup/logout
        useSSE.ts                ← Server-sent events (real-time updates)
        useFormaJuridica.ts      ← Company legal form helpers
      lib/
        api.ts                   ← API client (apiGet/apiPost/apiPut/apiDelete)

/packages/
  shared/                        ← Shared constants, types, validators
    src/
      constants.ts, types.ts, validators.ts

/docs/
  specs/                         ← Specificații tehnice (CE face)
    FAZA_1_Fundatie.md           ← DB schema, auth, layout, theme
    FAZA_2_Firme_Documente.md    ← Firme CRUD, ONRC, bilanț, documente
    FAZA_3_Template_Reguli.md    ← Ghid→reguli, template→elemente, XFA
    FAZA_4_Proiecte_Eligibilitate.md ← Proiecte, eligibilitate AI (Opus+ET)
    FAZA_5_Solomon.md            ← Chat AI, SSE, extragere elemente
    FAZA_6_Neemia.md             ← Generare documente DOCX/XLSX/PDF XFA
    FAZA_7_Admin_Configurari.md  ← Users, AI costs, config, provider
    FAZA_8_Polish_Finalizare.md  ← Responsive, email, export, deploy
  prototypes/                    ← Prototipuri vizuale (CUM arată)
    00_Provider.jsx              ← Provider dashboard
    01_Login.jsx                 ← Login + signup wizard
    02_Panou.jsx                 ← Dashboard principal
    03_Firme.jsx                 ← Pagina Firme (11 forme juridice)
    04_Documente.jsx             ← Arbore documente
    04b_TemplateViewer.jsx       ← Viewer template cu checklist
    05_Proiecte.jsx              ← Lista proiecte (carduri + tabel)
    05b_ProjectView.jsx          ← Detalii proiect (sidebar arbore, 7 secțiuni)
    06_Configurari.jsx           ← Configurări (6 secțiuni)
    07_Admin.jsx                 ← Admin (users, AI costs, audit)
```

## Reguli de implementare

### 1. VIZUALUL VINE DIN PROTOTIPURI — NU INVENTA

Fiecare pagină are un prototip JSX care definește **exact** cum arată:
- **Culori** — folosește CSS custom properties din prototip (--bg-deep, --accent-blue, etc.)
- **Layout** — respectă structura (sidebar, split pane, grids) din prototip
- **Spacing** — respectă padding, gap, margin din prototip
- **Tipografie** — Inter + JetBrains Mono, weights, sizes din prototip
- **Componente** — structura HTML/JSX, class names, comportament
- **Interacțiuni** — hover states, transitions, animations din prototip

**NU modifica vizualul** decât dacă e necesar tehnic (ex: înlocuiește mock data cu date reale).

### 2. FUNCȚIONALITATEA VINE DIN SPECIFICAȚII

Specificațiile FAZA_1-8 definesc:
- Schema bazei de date (Drizzle + PostgreSQL)
- API routes (Hono)
- Servicii backend (AI processing, OCR, XFA)
- Business logic (eligibilitate, Solomon, Neemia)
- Auth flows, middleware, queue-uri

### 3. MAPARE PAGINĂ → PROTOTIP → SPEC

| Pagină | Prototip (vizual) | Spec (funcțional) |
|--------|-------------------|-------------------|
| Provider Dashboard | `00_Provider.jsx` | FAZA_7 §7.6 |
| Login / Signup | `01_Login.jsx` | FAZA_1 §auth routes |
| Dashboard (Panou) | `02_Panou.jsx` | FAZA_8 (responsive) + noul route GET /api/dashboard |
| Firme | `03_Firme.jsx` | FAZA_2 §2.4-2.8 |
| Documente | `04_Documente.jsx` | FAZA_2 §2.6-2.7 |
| Template Viewer | `04b_TemplateViewer.jsx` | FAZA_3 §3.3 |
| Proiecte (lista) | `05_Proiecte.jsx` | FAZA_4 §4.3 |
| **ProjectView** | `05b_ProjectView.jsx` | FAZA_4 §4.4 + FAZA_5 + FAZA_6 |
| Configurări | `06_Configurari.jsx` | FAZA_7 §7.5 |
| Admin | `07_Admin.jsx` | FAZA_7 §7.4 |

### 4. ORDINEA DE IMPLEMENTARE

Respectă ordinea fazelor: FAZA_1 → FAZA_2 → ... → FAZA_8.
Fiecare fază are un **CHECKLIST** la final — bifează fiecare item implementat.

### 5. DESIGN SYSTEM (din prototipuri)

**Toate prototipurile folosesc același design system.** Extrage-l o singură dată și reutilizează-l.

#### CSS Custom Properties (Dark Theme — default)
```css
--bg-deep: #0a0c10;
--bg-surface: #12151c;
--bg-elevated: #1a1e28;
--bg-hover: #222838;
--border: #2a3040;
--border-active: #3d4760;
--text-primary: #e8ecf4;
--text-secondary: #8892a8;
--text-muted: #5a6478;
--accent-blue: #4d8bff;
--accent-green: #34d399;
--accent-red: #f87171;
--accent-yellow: #fbbf24;
--accent-purple: #a78bfa;
--accent-orange: #fb923c;
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
--r-sm: 6px;
--r-md: 10px;
--r-lg: 14px;
```

#### CSS Custom Properties (Light Theme)
```css
--bg-deep: #f0f2f5;
--bg-surface: #ffffff;
--bg-elevated: #f8f9fb;
--bg-hover: #eef0f4;
--border: #e0e4ea;
--border-active: #c8cdd6;
--text-primary: #1a1e28;
--text-secondary: #5a6478;
--text-muted: #8892a8;
/* accent colors same as dark */
```

#### Sidebar (240px, collapsible la 64px pe tablet)
- Logo: 36px icon + "DosarFonduri" text
- Nav items: icon 20px + label 14px, active = accent-blue bg 10%
- Secțiuni: uppercase 10px bold, letter-spacing 1px
- Footer: avatar 32px + name + role + theme toggle

#### Componente reutilizabile (extrase din prototipuri)
- **SplitPane** — drag resize, min widths (04_Documente.jsx)
- **TreeBranch / TreeLeaf** — collapsible cu badge (05b_ProjectView.jsx)
- **StatusBadge** — rounded pill cu bg/color per status
- **ProgressBar** — height 6px, border-radius 3px
- **Modal** — overlay blur + card animat slideUp
- **Toggle** — width 44px, knob 20px
- **Card** — border + surface bg + hover border-active

### 6. PROJECTVIEW — STRUCTURA DEFINITIVĂ

**ProjectView folosește SIDEBAR ARBORE (tree nav), NU tab-uri orizontale.**

Structura din `05b_ProjectView.jsx`:
```
SIDEBAR ARBORE (260px)              CONȚINUT PRINCIPAL
┌─────────────────────────┐  ┌──────────────────────────┐
│ PROIECT                 │  │                          │
│ "Modernizare fabrică"   │  │  [conținut depinde de    │
│ COMEXIM R SRL · 2146135 │  │   selecția din arbore]   │
│                         │  │                          │
│ ▼ Scriere proiect       │  │                          │
│   🛡 Eligibilitate 12/13│  │                          │
│   📖 Ghid Finanțare  8  │  │                          │
│   🤖 Solomon      Opus  │  │                          │
│   📊 Elemente     14/18 │  │                          │
│   📋 Checklist doc 5/17 │  │                          │
│   📄 Neemia        0/31 │  │                          │
│ ▶ Implementare    TBD   │  │                          │
│ ▶ Monitorizare    TBD   │  │                          │
└─────────────────────────┘  └──────────────────────────┘
```

Secțiunile Eligibilitate, Solomon, Ghid, Elemente, Checklist, Neemia sunt toate componente React separate, activate prin `activeLeaf` state.

### 7. TRASABILITATE COMPLETĂ

Fișierul `docs/specs/REVIEW_Prototipuri_vs_Specs.md` documentează procesul de aliniere (dacă există). **Toate cele 8 diferențe identificate au fost rezolvate:**

- ✅ ProjectView: sidebar arbore (FAZA_4 §4.4 actualizat)
- ✅ Ghid Finanțare: secțiune separată cu PDF viewer + route (FAZA_4 §4.4)
- ✅ Checklist Documente: tabel DB + CRUD routes + frontend (FAZA_1 + FAZA_4)
- ✅ Sumar: secțiune nouă în ProjectView (FAZA_4 §4.4)
- ✅ Solomon: model selector + ET toggle + inline refine (FAZA_5 §5.3)
- ✅ Neemia: 3 panouri layout (FAZA_6 §6.3)
- ✅ Elemente: split + detail + istoric (FAZA_4 §4.4)
- ✅ Dashboard: route + frontend complet (FAZA_8 §8.0)

**Nu mai există ambiguități între prototipuri și specificații.**

### 8. TECH STACK

- **Frontend**: Next.js 15 (App Router) + React + Tailwind (tokens din design system)
- **Backend**: Hono (API) + Drizzle (ORM) + PostgreSQL + Redis
- **AI**: Anthropic API (Haiku/Sonnet/Opus + Extended Thinking)
- **Storage**: Cloudflare R2 / S3
- **Queue**: BullMQ + Redis
- **Deploy**: Railway (API + Web + Worker)
- **Monorepo**: Turborepo (`turbo.json`) with `apps/api`, `apps/web`, `packages/shared`

### 9. STARE IMPLEMENTARE (actualizat 2026-03-23)

**Toate fazele FAZA_1–FAZA_7 sunt implementate.** Codebase-ul este funcțional end-to-end:

| Componentă | Status | Detalii |
|------------|--------|---------|
| DB Schema + Migrations | ✅ Complet | `schema.ts` (30 tabele) + 42 migrations (0000–0115) |
| Auth (login/signup/me) | ✅ Complet | JWT tokens, cabinet codes, provider auth, password reset |
| Companies CRUD | ✅ Complet | Auto (CUI/ListaFirme) + Manual (ONRC PDF upload) |
| OCR + Extractors | ✅ Complet | 12+ specialized extractors (ONRC, bilanț, facturi, etc.) |
| Documents + Folders | ✅ Complet | Tree structure, upload, reprocessing |
| Templates + XFA | ✅ Complet | Element detection, XFA fill, compose config |
| Projects + Eligibility | ✅ Complet | Rule extraction, AI checking, reference tables |
| Solomon (Chat AI) | ✅ Complet | SSE streaming, model selection, ET toggle, file upload |
| Neemia (Doc Gen) | ✅ Complet | Fill + Compose modes, bulk generation, versioning |
| Settings + Config | ✅ Complet | AI models, integrations, branding, notifications |
| Admin (Users/Costs) | ✅ Complet | User management, AI cost tracking, audit log |
| Provider Dashboard | ✅ Complet | Cabinet list, invite codes |
| Frontend (all pages) | ✅ Complet | 10 pages matching prototypes |
| FAZA_8 (Polish) | 🔶 Partial | Missing: responsive mobile, email sending, export |

### 10. ARCHITECTURE PATTERNS (din implementarea existentă)

#### State Management
- **NO Redux/Zustand** — toate paginile folosesc `useState` + `useEffect`
- **Auth**: `AuthContext` via `useAuthState()` — global
- **SSE**: `useSSE()` hook in app shell — global events + toasts
- **Theme**: `ThemeProvider` via context

#### API Client (`apps/web/src/lib/api.ts`)
```typescript
// Base URL = "" (relative — Next.js rewrites /api/* to backend)
// Timeout = 30s, auto-includes Authorization header from localStorage
apiGet<T>(path)                    // GET + JSON parse
apiPost<T>(path, body)             // POST + JSON stringify
apiPut<T>(path, body)              // PUT + JSON stringify
apiDelete<T>(path)                 // DELETE
// FormData: auto-detects, skips Content-Type header
```

#### Auth Token Storage
- Org users: `localStorage.getItem('df-token')`
- Provider users: `localStorage.getItem('df-provider-token')`

#### SSE Real-time Events
- Endpoint: `GET /api/events?projectId=...`
- Events: `document_processed`, `document_failed`, `eligibility_updated`, `element_validated`, `extraction_*`, `job_progress`
- Auto-reconnect with exponential backoff (max 5 attempts)

#### Project Locking
- Pessimistic lock per project (acquire on mount, heartbeat every 5 min, release on unmount + beforeunload)
- `POST /api/projects/:id/lock` → acquire
- `POST /api/projects/:id/lock/heartbeat` → keep alive
- `DELETE /api/projects/:id/lock` → release

#### Migrations
- Sequential SQL files in `apps/api/src/db/migrations/` (prefix `0000_` to `0116_`)
- Run via `apps/api/src/db/migrate.ts`
- Schema defined in `apps/api/src/db/schema.ts` (single file, 30 tables)
- Key alignment migrations: `0099_alignment.sql`, `0111_user_delete_cascade.sql`, `0112_schema_fk_audit_fixes.sql`, `0116_db_audit_fixes.sql`

#### Delete Strategy
- **100% hard delete** — no soft delete / `deleted_at` anywhere
- R2/S3 storage cleanup on entity delete (companies, documents, projects, folders)
- CASCADE FK for child entities (associates, admins, rules, elements, etc.)
- 6 db.transaction blocks for atomic upserts (company creation, eligibility, scoring)

### 11. KNOWN GAPS (nu sunt încă implementate)

1. **Responsive/mobile design** — Layout-ul e fix (sidebar always visible), nu există breakpoints mobile/tablet
2. **Implementare + Monitorizare branches** — Definite în sidebar-ul ProjectView dar secțiunile nu sunt implementate (afișează "TBD")
3. **Email notifications** — Configurate în Settings dar nu se trimit efectiv
4. **Export & Backup** — Secțiune stub în Settings
5. **Download button for Neemia docs** — `downloadUrl` există dar nu are buton vizibil în UI
6. **Audit log filtering** — Admin page afișează log-ul dar fără filtrare UI
7. **Version rollback** — Neemia version history se încarcă dar nu are buton de restore
8. **Anexe tab** — Ghid Finanțare sub-tab "Anexe" este stub

### 11b. DB AUDIT (2026-03-23) — ✅ TOATE FIXATE

**Toate problemele de DB au fost fixate** în commit `b486619` (migration `0116_db_audit_fixes.sql`):
- ✅ C1-C2: `onDelete: "set null"` pe `project_elements.template_element_id` și `element_def_id`
- ✅ C3-C4: R2 cleanup pe company/folder delete (inclusiv Neemia-generated files)
- ✅ C5: Lock release verifică organizationId din user record
- ✅ C6: Migration 0111 — eliminat ALTER pe `documents.created_by` inexistent
- ✅ M1-M13: 15 indexuri noi pe CASCADE FK columns
- ✅ M14: Associates/admins replace wrapped în `db.transaction()`
- ✅ L2: Checklist delete filtrează pe `projectId`
- ✅ L3: Reference table delete verifică referințe active (409 + `?force=true`)

### 11c. ARCHITECTURE AUDIT (2026-03-23) — PROBLEME DESCOPERITE

**Rezumat**: 125+ API endpoints, 16 pagini frontend, 30+ componente, 38+ servicii, 7 job procesoare, 0 teste.

#### CRITICE

| # | Fișier:Linie | Axă | Problemă | Fix propus |
|---|-------------|-----|----------|-----------|
| C1 | `projects.ts:1267` | Securitate | DELETE proiect nu filtrează pe `organizationId` în WHERE (doar SELECT verifică) | Adaugă `eq(projects.organizationId, auth.organizationId!)` în DELETE |
| C2 | `projects.ts:1199-1210` | Securitate | Lock release: dacă `organizationId` e null, query nu filtrează pe org → cross-org leak | Adaugă `if (!organizationId) return 401` explicit |
| C3 | `health.ts:57,64` | Securitate | `/health/invalidate-cache` și `/health/run-migrations` fără auth | Adaugă secret param sau auth |
| C4 | `projects/[id]/page.tsx` | Organizare | **5.691 linii** monolith — imposibil de menținut/testat | Split în 7+ componente (Eligibility, Solomon, Elements, etc.) |
| C5 | `projects.ts:493-525` | Performance | N+1 CRITIC: per-element 2 queries (templateEl + elemDef). 100 elem = 200 queries | Batch cu `inArray()` |
| C6 | `neemia.ts:587` | Observabilitate | AI usage log `.catch(() => {})` — cost tracking pierdut | Cel puțin log error |

#### MEDII

| # | Fișier:Linie | Axă | Problemă |
|---|-------------|-----|----------|
| M1 | `admin.ts:100-113` | Performance | N+1: per-user project count (20 users = 20 queries extra) |
| M2 | `documents.ts:196-225` | Performance | N+1: per-document 3× count queries (50 docs = 150 queries) |
| M3 | `export.ts:20-39` | Performance | N+1 dublu: per-project elements × per-element template (5000 queries posibil) |
| M4 | `export.ts:81-90` | Performance | N+1: per-project element count |
| M5 | `projects.ts:824-844` | Performance | N+1: per-eligibility rule + doc lookups |
| M6 | `projects.ts:756,899` | Reziliență | `checkEligibility()` fără try-catch |
| M7 | `companies.ts:47-52` | Performance | GET /companies fără paginare |
| M8 | `projects.ts:106-109` | Performance | GET /projects fără paginare |
| M9 | `routes/*.ts` | Type Safety | 100× `as any` type assertions |
| M10 | `components/shared/` vs `ui/` | Organizare | 6 componente duplicate (EmptyState, PageHeader, StatCard, StatusBadge, ProgressBar, TypeBadge) |
| M11 | `projects/[id]/page.tsx` | Reziliență | 9 useEffect, doar 2 cu cleanup — 7 potențiale memory leaks |
| M12 | `projects.ts:1065-1077` | Securitate | Checklist delete verifică projectId dar NU org ownership |
| M13 | Toate DELETE routes | API Design | Returnează 200 `{ ok: true }` în loc de 204 |
| M14 | `auth.ts:222,244` | Validare | check-invited/validate-code fără zod |
| M15 | `index.ts:86-87` | Securitate | Zero rate limit pe Solomon, Neemia, eligibility AI endpoints |

#### LOW

| # | Fișier:Linie | Axă | Problemă |
|---|-------------|-----|----------|
| L1 | `neemia.ts:153-165` | Performance | N+1 minor: per-neemia-doc template lookup |
| L2 | `reference-tables.ts:189-221` | Performance | N+1: per-link table/rule lookups |
| L3 | `projects.ts:997-1006` | Performance | N+1: per-checklist-item template lookup |
| L4 | `rateLimit.ts:14` | Securitate | IP spoofable via x-forwarded-for |
| L5 | `index.ts:256` | Securitate | Setup-DB expune stack trace |
| L6 | Multiple | Logging | `.catch(e => warn(e.message))` pierde stack |
| L7 | `solomon.ts:22-30` | Securitate | sanitizeForPrompt limitată (doar `<>` și `═`) |
| L8 | Codebase | Testabilitate | **Zero teste** (nici unit, nici integration, nici E2E) |

#### TOP 5 IMPROVEMENTS (effort/impact)

1. **Split `projects/[id]/page.tsx`** (5691→7 componente) — ~4h, cel mai mare ROI
2. **Fix N+1 queries** (C5, M1-M5) cu batch `inArray()` — ~3h
3. **Adaugă paginare** pe GET /companies, /projects — ~2h
4. **Auth pe health routes + org filter pe DELETE** (C1, C3) — ~1h
5. **Consolidează componente duplicate** (shared/ vs ui/) — ~2h

#### ARCHITECTURE DECISIONS (de păstrat la refactor)

- **ADR-1**: useState + useEffect only (no Redux/Zustand) — corect pentru scală actuală
- **ADR-2**: 100% hard delete — simplifică schema + GDPR
- **ADR-3**: Pessimistic locking pe proiecte (acquire/heartbeat/release)
- **ADR-4**: AI concurrency limiter global (max 3, queue, retry 4×)
- **ADR-5**: SSE via Redis pub/sub (scalabil multi-instanță)
- **ADR-6**: Single schema.ts (30 tabele, split la 50+)
- **ADR-7**: Dual storage (S3/R2 + local filesystem)
- **ADR-8**: Job processors separați per document type
- **ADR-9**: Extraction cache Redis (document hash → results)

### 11d. QA AUDIT (2026-03-24)

**Full audit report:** `docs/QA_AUDIT_REPORT.md`
**SQL verification:** `scripts/verify_integrity.sql`

**Summary:** 23 findings across security, performance, data integrity, E2E flows, API contracts, UI/UX.

| Priority | Count | Key findings |
|----------|-------|-------------|
| CRITICAL | 3 | IDOR on element/eligibility/checklist updates; unauthed health/run-migrations; CNP plaintext |
| HIGH | 7 | Rate limiting AI endpoints; N+1 200 queries/page; associates not transactional; prefill/eligibility race; guide deletes validated rules |
| MEDIUM | 7 | Split ProjectView 5691 lines; pagination; missing Zod; file upload magic-byte; duplicate components; orphan cleanup |
| LOW | 6 | DELETE 200→204; stack traces; tmp file collision; Unicode sanitization; zero tests |

**E2E flows traced:** Company registration, Guide processing, Template upload, Project creation + eligibility, Delete cascades — 13 gaps documented (G1–G13).

**SQL verification script** detects: orphan files, placeholder companies, zero-element projects, dangling FK refs, duplicate CUI, orphan eligibility/checklist/conversations.

### 12. BUILD VERIFICATION RULE

**ÎNAINTE de orice commit, rulează AMBELE build-uri:**

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx next build
```

- Dacă **ORICARE** eșuează → **NU face commit**. Fixează mai întâi.
- TypeScript build LOCAL nu e suficient. Docker build-ul poate eșua din motive diferite (dependințe lipsă, shared packages, env vars).
- Shared package trebuie compilat înainte de web: `cd packages/shared && npx tsc`

## RAG v2 Migration — Sprint 1 COMPLET (2026-03-31)

- Tabel `chunks` creat (vector 1024 + tsvector GENERATED + JSONB metadata) — `schema.ts` + `0128_rag_v2_chunks.sql`
- Voyage AI SDK instalat (`voyageai`), serviciu `voyageEmbeddings.ts` funcțional (embedQuery, embedDocumentChunks, embedTexts)
- Hybrid search (vector cosine + BM25 keyword + RRF K=60) în `hybridSearch.ts`
- `vectorType()` helper factorizat din `vector1536` — reutilizabil pentru orice dimensiune
- Tabelele vechi (`guideChunks`, `solomonKnowledge`) și `embeddings.ts` (OpenAI) — INTACTE
- Următorul sprint: SPRINT_2 — Single Entry Point (clasificare + routing pipeline)

## RAG v2 Migration — Sprint 2 COMPLET (2026-03-31)

- Single entry point: UN upload, AI clasifică și rutează automat
- 5 rute: vectorize | template_fill | template_compose | extract_data | vectorize_and_extract
- Clasificator Sonnet (`documentClassifier.ts`) cu confidence scoring
- Pipeline (`ingestDocument.ts`): OCR → classify → route → (chunk+embed | extract | mark template)
- Chunker RAG v2 (`ragChunker.ts`): 400 tok target, 10% overlap
- Metadata enrichment (`metadataEnricher.ts`): Sonnet assigns layer/topic/importance per chunk
- Data extractor (`dataExtractor.ts`): Sonnet extracts structured fields from client documents
- BullMQ `ingest-document` job (`ingestDocumentJob.ts`) — concurrency 2, rate limited
- Câmp `classification` JSONB pe tabelul `documents` (migration `0129_rag_v2_classification.sql`)
- Endpoint `GET /folders/:id/classified-documents` — lista documente cu clasificare
- Endpoint `PUT /documents/:id/reclassify` — reclasificare manuală + re-procesare
- Upload flow: ingest job dispatched ALONGSIDE existing jobs (coexistență)
- processGuide, processTemplate, processClientDoc — INTACTE
- Următorul sprint: SPRINT_3 — Solomon tool use + faze Q0-Q11

## RAG v2 Migration — Sprint 3 COMPLET (2026-03-31)

- Solomon: tool use `search_knowledge` (hybrid search) + `get_session_documents` (inventar clasificat)
- Solomon: emite faze Q0-Q11 prin `<!--PHASE_JSON{...}PHASE_JSON-->` metadata
- System prompt: adăugat secțiuni TOOL USE + FAZE + COMPOSE BRIEF (instrucțiuni tool use, nu injecție de reguli)
- Tool use loop: max 6 tool calls per turn, non-streaming pentru tool rounds, streaming pentru final
- Phase indicator în UI: progress bar + label + next action (deasupra chat-ului)
- Tool use indicator: "🔍 Caut în ghid: ..." animat (sub toolbar)
- RAG injection automată DEZACTIVATĂ (comentată) — Solomon caută singur cu search_knowledge
- Auto eligibility + auto scoring DEZACTIVATE (comentate) — Solomon raționează prin tool use
- Endpoint `GET /solomon/projects/:id/phase` — faza curentă
- Endpoint `POST /solomon/projects/:id/compose-brief` — brief structurat pentru Neemia compose
- Câmpuri `solomon_phase` + `compose_brief` JSONB pe projects (migration `0130_rag_v2_solomon_phase.sql`)
- `solomonTools.ts` — tool handlers + definitions
- Rollback: decomentează RAG injection + auto eligibility/scoring + scoate tools din API call
- Următorul sprint: SPRINT_4 — UI single entry point + knowledge base

## RAG v2 Migration — Sprint 4 COMPLET (MIGRATION COMPLETĂ) (2026-03-31)

### Sumar complet migration RAG v2:
- Sprint 1: pgvector + chunks + Voyage SDK + hybrid search ✅
- Sprint 2: Single entry point documente cu clasificare AI Sonnet ✅
- Sprint 3: Solomon tool use + faze Q0-Q11 + compose brief ✅
- Sprint 4: UI + Neemia compose + Document versioning ✅

### Sprint 4 deliverables:
- **Documente tab** în ProjectView: upload zone + documente clasificate grupate pe categorie
- **ReclassifyDialog**: corectare manuală clasificare AI cu re-trigger pipeline
- **Knowledge base endpoints**: GET/POST/DELETE pe `/api/config/knowledge-base` cu ingest pipeline
- **Compose section generation**: `POST /neemia/projects/:id/compose/generate-section` cu brief Solomon + RAG
- **Coherence check**: `POST /neemia/projects/:id/compose/coherence-check` — Sonnet verifică coerența narativă
- **Document versioning schema**: `document_version`, `superseded_by`, `supersedes`, `is_current_version`, `version_diff` (migration `0131_rag_v2_versioning.sql`)
- **Version diff service** (`versionDiff.ts`): semantic diff Sonnet + `checkSameDocument` upgrade detection
- **ProjectData type** extended cu `folderId`, `solomonPhase`, `composeBrief`

### DEZACTIVAT (nu șters):
- processGuide, guideRetrieval, auto-eligibility, auto-scoring (comentate, rollback ușor)
- Arbore foldere documente (pagina veche funcționează în paralel)

## Sprint 5 — Eligibilitate, Scoring, Checklist Structurat COMPLET (2026-03-31)

- Solomon emite `ELIGIBILITY_JSON`, `SCORING_JSON`, `CHECKLIST_JSON` (lângă ELEMENTS_JSON și PHASE_JSON)
- Backend parsează și persistă în `solomonEligibility`, `solomonScoring`, `projectChecklist` (source=solomon)
- Upsert per regulă/criteriu — se acumulează și actualizează pe parcursul conversației
- Tabele noi: `solomon_eligibility` (unique on project+rule), `solomon_scoring` (unique on project+criterion)
- Migration `0132_solomon_structured_output.sql` + `source_reference` pe projectChecklist
- Endpoints: GET `/solomon/projects/:id/eligibility`, `/scoring`, `/document-checklist`
- UI: Solomon Eligibility Panel în tab-ul Reguli, Solomon Scoring Table în tab-ul Scor
- SSE events: `eligibility_update`, `scoring_update`, `checklist_update` — frontend se actualizează live
- Solomon raționează din RAG, persistă concluziile structurat — best of both worlds

## Universal Forms — Sprint FORM-1 COMPLET (2026-03-31)

- FormSpec JSON: format universal pentru orice formular din orice program
- 4 extractori în `formspec_extract.py`: XFA (PyMuPDF xref), AcroForm (PyMuPDF widgets), DOCX (python-docx placeholders), XLSX (openpyxl cells+formulas)
- Detector automat de format (XFA > AcroForm > DOCX > XLSX)
- TypeScript service `formSpecExtractor.ts`: bridge to Python, buffer handling, DB persistence
- Tabel `form_specs` cu FormSpec JSONB complet (migration `0133_form_specs.sql`)
- API routes: POST `/forms/extract`, GET `/forms/spec/:id`, GET `/forms/document/:id`, GET `/forms/spec/:id/reference-data`
- Integrat cu pipeline clasificare: `template_fill` → auto-extract FormSpec la ingestie
- Următorul sprint: HTML renderer universal + export multi-format (SPRINT_FORM-2)

## Universal Forms — Sprint FORM-2 v2 COMPLET (2026-03-31)

- Tabel `form_data` cu `field_values` JSONB + `page_approvals` JSONB + completion tracking (migration `0134_form_data.sql`)
- API endpoints pentru form data CRUD:
  - GET/PUT field values, POST approve/unapprove page, POST auto-populate, GET overview
- Auto-populate: mapează project_elements → form fields via `mappedElementName`
- Page approval workflow: per-page visual verification cu tracking per consultant
- Export blocat până la `allPagesApproved === true`
- Completion percent calculat automat la fiecare field edit
- Unique constraint pe (project_id, form_spec_id) — un singur form_data per formular per proiect
- Refolosește `documentRenderer.ts` existent pentru rendering pagini cu field positions

## Fix Sprint — FAZA 1+2 Backend COMPLET (2026-03-31)

- [x] FIX 1.1: System prompt Solomon redus — scoase rules/tables/scoring/checklist injections, Solomon caută cu search_knowledge
- [x] FIX 1.2: KB upload migreat la chunks (Voyage 1024) — Settings page folosește `/api/config/knowledge-base/upload`
- [x] FIX 1.3: neemiaCompose integrează composeBrief + hybridSearch RAG context per secțiune
- [x] FIX 1.4: processGuide dezactivat la upload ghid — toate 4 dispatch-uri comentate
- [x] FIX 2.1: documentVersionUpgrade cascade + endpoints (confirm-upgrade, versions)
- [x] FIX 2.2: Forms export endpoint (PDF/DOCX/XLSX fill from approved form data)
- [x] FIX 2.3: GET eligibility/scoring/checklist endpoints verificate (există din Sprint 5)

## RUNDA 0 — Template Pipeline Fix COMPLET (2026-03-31)

- [x] routeTemplateCompose: dispatch processTemplate job + set generationMode=compose + processingType=template
- [x] routeTemplateFill: dispatch processTemplate job + FormSpec extraction + set generationMode=fill + processingType=template
- [x] getProjectTemplates: caută ATÂT în subfolder "templateuri" CÂT ȘI în folderul sesiune (classification.routingAction)
- [x] Neemia documents endpoint: returnează și template-uri disponibile (status="available") pe lângă cele generate
- [x] processingType setat pe document ("template") la routing — processTemplate recunoaște documentul
- [x] Build check: tsc + next build PASS
