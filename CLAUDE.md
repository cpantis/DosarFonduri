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

### 9. STARE IMPLEMENTARE (actualizat)

**Toate fazele FAZA_1–FAZA_7 sunt implementate.** Codebase-ul este funcțional end-to-end:

| Componentă | Status | Detalii |
|------------|--------|---------|
| DB Schema + Migrations | ✅ Complet | `schema.ts` + 17 migrations (0001–0017) |
| Auth (login/signup/me) | ✅ Complet | JWT tokens, cabinet codes, provider auth |
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
- Sequential SQL files in `apps/api/src/db/migrations/` (prefix `0001_` to `0017_`)
- Run via `apps/api/src/db/migrate.ts`
- Schema defined in `apps/api/src/db/schema.ts` (single file, all tables)

### 11. KNOWN GAPS (nu sunt încă implementate)

1. **Responsive/mobile design** — Layout-ul e fix (sidebar always visible), nu există breakpoints mobile/tablet
2. **Implementare + Monitorizare branches** — Definite în sidebar-ul ProjectView dar secțiunile nu sunt implementate (afișează "TBD")
3. **Email notifications** — Configurate în Settings dar nu se trimit efectiv
4. **Export & Backup** — Secțiune stub în Settings
5. **Download button for Neemia docs** — `downloadUrl` există dar nu are buton vizibil în UI
6. **Audit log filtering** — Admin page afișează log-ul dar fără filtrare UI
7. **Version rollback** — Neemia version history se încarcă dar nu are buton de restore
8. **Anexe tab** — Ghid Finanțare sub-tab "Anexe" este stub

### 12. BUILD VERIFICATION RULE

**ÎNAINTE de orice commit, rulează AMBELE build-uri:**

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx next build
```

- Dacă **ORICARE** eșuează → **NU face commit**. Fixează mai întâi.
- TypeScript build LOCAL nu e suficient. Docker build-ul poate eșua din motive diferite (dependințe lipsă, shared packages, env vars).
- Shared package trebuie compilat înainte de web: `cd packages/shared && npx tsc`
