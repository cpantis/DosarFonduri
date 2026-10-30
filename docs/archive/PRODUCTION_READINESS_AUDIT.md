# AUDIT PRODUCTION-READINESS — DosarFonduri

**Data:** 2026-03-25
**Perspectivă:** Software Architect + Test Architect + Consultant Expert Fonduri Europene
**Verdict:** APROAPE GATA — 6 critice, 12 medii, 9 low

---

## REZUMAT EXECUTIV

Platforma DosarFonduri este **funcțională end-to-end** cu un stack solid (Hono + Drizzle + Next.js 15). Securitatea de bază (JWT, bcrypt 12 rounds, rate limiting, FK cascades) este corectă. Principalele riscuri pentru producție sunt: (1) lipsa testelor automatizate, (2) ProjectView monolith 5.7K linii, (3) câteva lipsuri de validare și (4) potențiale probleme de cost AI.

---

## I. SECURITATE & INFRASTRUCTURĂ (Software Architect)

### CRITICE

| # | Problemă | Fișier | Impact | Îmbunătățire propusă |
|---|----------|--------|--------|---------------------|
| **C1** | `ADMIN_SECRET` fallback la `JWT_SECRET` — run-migrations/invalidate-cache accesibile cu token utilizator normal | `routes/health.ts:59` | Oricine cu cont poate triggera migrări DB | Require `ADMIN_SECRET` separat, fără fallback |
| **C2** | Zero teste automatizate (nici unit, nici integration, nici E2E) | Codebase-wide | Imposibil de verificat regresii la deploy | Minimum: teste critice pe eligibilitate + auth + element cascade |

### MEDII

| # | Problemă | Fișier | Îmbunătățire propusă |
|---|----------|--------|---------------------|
| **M1** | Nu există magic byte validation pe upload (PDF header %PDF, DOCX header PK) | `routes/documents.ts:345-376` | Validare primii 4-8 bytes la confirm-upload |
| **M2** | IP spoofable via `x-forwarded-for` — rate limiting ocolibil | `middleware/rateLimit.ts:14` | Documentare că Railway proxy e trusted; opțional: validare sursa |
| **M3** | Nu există refresh token rotation — JWT 7 zile fără revocare | `routes/auth.ts:54,107` | Acceptabil v1, dar adaugă refresh tokens post-launch |
| **M4** | Silent `.catch(() => {})` pe file deletion — R2 orphan files | `routes/documents.ts:868, 132, 147` | Minim: log error cu context |
| **M5** | Confirm-upload nu re-validează file size vs MAX_SIZE | `routes/documents.ts:442-452` | Adaugă check: `if (size > maxSize) reject` |

### LOW

| # | Problemă | Fișier | Îmbunătățire propusă |
|---|----------|--------|---------------------|
| **L1** | Zero structured logging (doar console.error/warn) | Codebase-wide | Pino/Winston pentru Railway multi-instance |
| **L2** | DB fallback `localhost:5432` dacă DATABASE_URL unset | `db/index.ts:11` | Remove fallback (startup validation prinde oricum) |
| **L3** | SSL DB nu e explicit configurat | `db/index.ts:11-16` | Verificare `?sslmode=require` în DATABASE_URL |

---

## II. API CONTRACTS & DATA FLOWS (Test Architect)

### CRITICE

| # | Problemă | Fișier | Impact | Îmbunătățire propusă |
|---|----------|--------|--------|---------------------|
| **C3** | Element update cascade (update → validate → eligibility → score) nu e în tranzacție | `routes/projects.ts:821-920` | Race condition: două request-uri simultane pot citi stale data | Wrap cascade complet în `db.transaction()` |
| **C4** | ProjectView monolith — 5.792 linii, 10+ useEffect, 50+ useState | `web/projects/[id]/page.tsx` | Imposibil de testat, menținut, sau review-uit | Split în 7 componente: Eligibility, Solomon, Elements, Checklist, Neemia, GuideViewer, Summary |

### MEDII

| # | Problemă | Fișier | Îmbunătățire propusă |
|---|----------|--------|---------------------|
| **M6** | `GET /admin/users` fără paginare — OOM la 1000+ users | `routes/admin.ts:79-116` | Adaugă `limit`/`offset` pattern |
| **M7** | `PUT /documents/folders/:id` rename fără Zod validation | `routes/documents.ts:109-119` | Adaugă `z.object({ name: z.string().min(1).max(255) })` |
| **M8** | `POST /documents/:id/reprocess` body parse cu `.catch(() => ({}))` | `routes/documents.ts:928-935` | Validare explicită cu Zod |
| **M9** | Solomon conversation history crește nelimitat — cost explosion | `routes/solomon.ts:70-83` | Adaugă max messages/conversation (ex: 200) sau token budget |
| **M10** | Eligibility override nu trigger score recalculation | `routes/projects.ts:1160-1178` | Adaugă `computeProjectScores(id)` după override |
| **M11** | SSE connections fără idle timeout — 100 tabs deschise = 100 Redis subscribers permanent | `lib/sse.ts:178-226` | Adaugă idle disconnect la 30 min inactivitate |

### LOW

| # | Problemă | Fișier | Îmbunătățire propusă |
|---|----------|--------|---------------------|
| **L4** | DELETE endpoints returnează 200 `{ok: true}` în loc de 204 | Multiple | Non-standard REST; nu schimba (ar sparge frontend) |
| **L5** | Document reprocess fără deduplication (click 2x = 2 job-uri) | `routes/documents.ts:928-945` | Check if job exists before dispatch |
| **L6** | Orphan R2 files din failed uploads (upload OK, DB insert fail) | `routes/documents.ts` | Cleanup job periodic sau TTL pe presigned URL |

---

## III. LOGICĂ DOMENIU FONDURI EUROPENE (Consultant Expert)

### CRITICE

| # | Problemă | Fișier | Impact pe dosare | Îmbunătățire propusă |
|---|----------|--------|------------------|---------------------|
| **C5** | CNP stocat plaintext — `SENSITIVE_ELEMENT_KEYS` definit dar `encrypt()` nu e apelat la scriere | `routes/projects.ts:33, 700-708` | Încălcare GDPR dacă CNP colectat de consultant | Apelează `encrypt(value)` la INSERT când key ∈ SENSITIVE_ELEMENT_KEYS |
| **C6** | Niciun rate limit pe Solomon/Neemia serial — concurrency limiter (max 3 paralel) dar fără limită pe request-uri secvențiale | `index.ts:86-91` | Un consultant poate genera facturi AI de 10K€+ într-o zi | Adaugă daily budget per org (ex: 50€/zi) cu alertă la 80% |

### MEDII

| # | Problemă | Fișier | Impact pe dosare | Îmbunătățire propusă |
|---|----------|--------|------------------|---------------------|
| **M12** | Override eligibilitate fără timestamp (`overriddenAt`) | `routes/projects.ts:1167-1176` | Audit trail incomplet la evaluare dosar respins | Adaugă coloană `overridden_at timestamp` (necesită migrare DB) |
| **M13** | Nu există detecție conflicte între reguli de eligibilitate | `services/eligibility.ts` | Reguli contradictorii trec ambele — consultant nu e avertizat | Flag pe reguli conflictuale (ex: min/max pe aceeași metrică) |
| **M14** | Reference tables trunchiate la 200 rânduri în context AI | `services/solomon.ts:316` | Tabele lookup cu 500+ rânduri = informație incompletă pentru Solomon | Crește limita sau implementează search semantic |
| **M15** | Nu există rollback pe documente generate (Neemia) | `services/neemia.ts:557,596` | Versionare există dar fără UI de restore | Adaugă endpoint + buton "Restaurează versiunea anterioară" |
| **M16** | Pre-eligibilitate evaluează doar reguli fixe (nu interpretate) | `services/eligibility.ts:585-639` | Feedback instant la crearea proiectului e incomplet | Documentează clar că pre-eligibility e parțială |

### LOW

| # | Problemă | Fișier | Îmbunătățire propusă |
|---|----------|--------|---------------------|
| **L7** | Scoring fără audit trail — nu se vede cum au evoluat punctele | `services/scoring.ts:92-210` | Adaugă scoring_history table |
| **L8** | Compose section versions nu sunt accesibile din UI | `services/neemiaCompose.ts` | Endpoint GET + UI comparare versiuni |
| **L9** | Formula scoring pe numere mari — posibile erori de precizie | `services/scoring.ts:180-200` | Testare cu valori extremiste (CA >100M€) |

---

## IV. METRICI CODEBASE

| Metrică | Valoare | Evaluare |
|---------|---------|----------|
| Tabele DB | 30 | OK (split la 50+) |
| API Endpoints | 125+ | OK |
| Pagini frontend | 16 | OK |
| Servicii backend | 38+ | OK |
| Job processors | 7 | OK |
| Linii ProjectView | 5.792 | CRITIC — split necesar |
| `as any` type assertions | ~100 | MEDIU — reduce gradual |
| Teste automatizate | **0** | CRITIC |
| Migrări SQL | 42+ | OK |
| Rate-limited endpoints | 5 | OK (adaugă AI) |
| Tranzacții DB | 6 | Lipsesc 3 critice |

---

## V. PLAN DE ÎMBUNĂTĂȚIRI PRIORITIZATE

### Tier 1 — Blocante producție (estimate ~2-3 zile)

| # | Acțiune | Efort | DB Migration? |
|---|---------|-------|---------------|
| C1 | Require ADMIN_SECRET separat în health.ts | 30min | Nu |
| C2 | Teste minime: auth + eligibilitate + element cascade | 1 zi | Nu |
| C3 | Wrap element update cascade în tranzacție | 1h | Nu |
| C5 | Encrypt CNP la scriere | 1h | Nu |
| C6 | Daily AI budget per org + alertă | 3h | Da — coloană `daily_ai_budget` pe organizations |

### Tier 2 — Recomandare puternică post-launch (estimate ~3-4 zile)

| # | Acțiune | Efort | DB Migration? |
|---|---------|-------|---------------|
| C4 | Split ProjectView în 7 componente | 4h | Nu |
| M1 | Magic byte validation pe file upload | 1h | Nu |
| M6 | Paginare GET /admin/users | 1h | Nu |
| M7-M8 | Zod pe folder rename + reprocess | 30min | Nu |
| M9 | Limită mesaje/conversație Solomon | 1h | Nu |
| M10 | Score recalculation după eligibility override | 30min | Nu |
| M12 | Coloană overriddenAt pe project_eligibility | 30min | Da — ALTER TABLE |
| M13 | Detecție conflicte reguli eligibilitate | 3h | Nu |

### Tier 3 — Nice to have (backlog)

| # | Acțiune | Efort | DB Migration? |
|---|---------|-------|---------------|
| M3 | Refresh token rotation | 3h | Da — tabel refresh_tokens |
| M11 | SSE idle timeout | 1h | Nu |
| M15 | Neemia version rollback UI | 2h | Nu |
| L1 | Structured logging (Pino) | 2h | Nu |
| L7 | Scoring history table | 2h | Da |
| L8 | Compose version comparison UI | 2h | Nu |

---

## VI. MIGRĂRI DB NECESARE

Dacă implementezi toate îmbunătățirile:

| Migration | Descriere | Tier |
|-----------|-----------|------|
| `0117_add_daily_ai_budget.sql` | `ALTER TABLE organizations ADD COLUMN daily_ai_budget_cents integer DEFAULT 5000;` | Tier 1 |
| `0118_add_overridden_at.sql` | `ALTER TABLE project_eligibility ADD COLUMN overridden_at timestamp;` | Tier 2 |
| `0119_refresh_tokens.sql` | `CREATE TABLE refresh_tokens (...)` | Tier 3 |
| `0120_scoring_history.sql` | `CREATE TABLE scoring_history (...)` | Tier 3 |

**Notă:** Doar primele 2 sunt recomandate înainte de producție.

---

## VII. CE E BINE FĂCUT (de păstrat)

- **Auth solid**: bcrypt 12 rounds, JWT HS256 cu expiry, user status check la fiecare request
- **FK cascades corecte**: 100% hard delete cu cleanup R2/S3
- **Pessimistic locking**: Previne editare concurentă pe proiecte
- **AI concurrency limiter**: Max 3 parallel, queue cu retry
- **SSE via Redis pub/sub**: Scalabil multi-instanță
- **Eligibility dual-tier**: Fixed rules (instant) + Interpreted rules (AI cu Extended Thinking)
- **SME classification**: Implementare corectă Reg. 651/2014 Anexa I
- **CSV injection prevention**: Prefix cu `'` pe formule
- **Filename sanitization**: Prevenire directory traversal
- **Env validation la startup**: Fail-fast pe variabile lipsă
- **DB connection pooling**: 20 conn, idle timeout, max lifetime

---

**Concluzie:** Platforma este **funcțional completă** și **securizată la nivel de bază**. Principalele riscuri sunt operaționale (zero teste, monolith frontend) și de cost (AI fără buget limitat). Cu Tier 1 implementat (~2-3 zile), platforma este pregătită pentru producție cu utilizare controlată.
