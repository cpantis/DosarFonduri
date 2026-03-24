# QA Audit Report — DosarFonduri

**Data:** 2026-03-23
**Scope:** Full-stack audit: security, performance, data integrity, E2E flows, API contracts, UI/UX gaps
**Codebase:** 125+ API endpoints, 16 pages frontend, 30+ tables, 38+ services, 7 job processors, 0 tests

---

## Table of Contents

1. [Security Findings](#1-security-findings)
2. [IDOR Vulnerabilities](#2-idor-vulnerabilities)
3. [API Contract Audit](#3-api-contract-audit)
4. [Performance Issues (N+1, Pagination)](#4-performance-issues)
5. [E2E Flow Tracing](#5-e2e-flow-tracing)
6. [Data Integrity & Cascade Audit](#6-data-integrity--cascade-audit)
7. [UI/UX Gaps](#7-uiux-gaps)
8. [SQL Verification Queries](#8-sql-verification-queries)
9. [Priority Matrix](#9-priority-matrix)

---

## 1. Security Findings

### 1.1 Unprotected Health Routes (CRITICAL)

| Endpoint | Risk |
|----------|------|
| `GET /api/health/db` | No auth — exposes Redis, R2, Anthropic key presence |
| `POST /api/health/invalidate-cache` | No auth — forces DB preflight re-query |
| `POST /api/health/run-migrations` | **No auth — executes SQL migrations against production DB** |

**Root cause:** `health.ts` routes are mounted at `index.ts:92` *before* `authMiddleware` at `index.ts:95`. Hono applies middleware in registration order.

**Fix:** Move health route mounting after auth middleware, or add a `HEALTH_SECRET` query param check.

### 1.2 Rate Limiting Gaps

**Protected:** `/api/auth/*` (20 req/min), `/api/provider/*` (15 req/min)

**Unprotected (AI-expensive endpoints):**
- `POST /api/solomon/*/messages` — AI chat (Opus = $75/M output tokens)
- `POST /api/neemia/*/generate` — Document generation
- `POST /api/neemia/*/generate-all` — Bulk document generation
- `POST /api/projects/:id/check-eligibility` — AI eligibility (Opus + Extended Thinking)
- `POST /api/projects/:id/validate-all` — AI element validation
- `GET /api/events` — SSE (no limit on concurrent connections)

A compromised token can burn unlimited AI credits. The `withAILimit` concurrency limiter (max 3) limits blast radius but not total volume.

**IP spoofing:** `rateLimit.ts:14` reads `x-forwarded-for` directly — trivially spoofable.

### 1.3 File Upload: No Magic-Byte Validation

`documents.ts:337-342` — MIME type whitelist exists (pdf, docx, xlsx, doc, png, jpg) but trusts the **client-declared** MIME type. No content-sniffing/magic-byte verification. An attacker can upload arbitrary content with `mime_type: "application/pdf"`. Workers will fail gracefully on parse, but stored files served back to users could be exploited.

### 1.4 Stack Trace Exposure

- `index.ts:256` — `/setup-db` returns `err.stack?.substring(0, 500)` in HTTP response (protected by `SETUP_DB_SECRET`)
- `errorHandler.ts:54-55` — Dev mode returns raw error message (up to 300 chars) to client

### 1.5 CNP Values Stored Plaintext

`projects.ts:509-521` decrypts/masks CNP on read, but `encrypt()` is **never called** on element write paths (`projects.ts:640-680` CREATE, `projects.ts:700-708` UPDATE). CNP values arrive as plaintext from Solomon extraction and are stored plaintext. Comment at line 516: `"Value might be plaintext (pre-encryption migration)"` confirms this is known but unresolved.

### 1.6 Sanitization Limitations

`solomon.ts:22-30` — `sanitizeForPrompt()` strips `<>` and `═══` delimiters, caps at 2000 chars. Does NOT:
- Isolate user content with XML delimiters
- Filter Unicode homoglyphs (`‹ ›` vs `< >`)
- Apply to user chat messages (only to project metadata in system prompt)

---

## 2. IDOR Vulnerabilities

### 2.1 `requireLock()` Does Not Check Org

`projects.ts:47` — `requireLock(projectId, userId)` queries `eq(projects.id, projectId)` only, **no org filter**. All lock-gated PUT endpoints inherit this gap.

### 2.2 Element Update (CRITICAL)

`PUT /api/projects/:id/elements/:eid` (`projects.ts:684-787`)

Only gate: `requireLock(id, auth.userId)`. The DB UPDATE at line 707:
```sql
UPDATE project_elements SET ... WHERE id = :eid
```
No check that `eid` belongs to a project in the caller's org. An attacker who knows a `projectElementId` UUID can update any element across orgs.

### 2.3 Eligibility Override (CRITICAL)

`PUT /api/projects/:id/eligibility/:eid` (`projects.ts:905-923`)

Same pattern — UPDATE by `eid` UUID only, no org check.

### 2.4 Checklist Update (HIGH)

`PUT /api/projects/:id/checklist/:itemId` (`projects.ts:1043-1062`)

UPDATE by `itemId` UUID only. Inconsistent: the DELETE at line 1073 **does** add `eq(projectChecklist.projectId, id)`.

### 2.5 Bulk Confirm Elements (HIGH)

`PUT /api/projects/:id/elements-bulk/confirm` (`projects.ts:790-807`)

Iterates `elementIds` array, updates each with `eq(projectElements.id, eid)` — no org check on any individual ID.

### 2.6 Lock Release SendBeacon (MEDIUM)

`POST /api/projects/:id/lock/release` (`projects.ts:1159-1211`)

If `organizationId` is null, query falls back to `eq(projects.id, id)` without org filter:
```typescript
where: organizationId
  ? and(eq(projects.id, id), eq(projects.organizationId, organizationId))
  : eq(projects.id, id),
```

### 2.7 DELETE Project Race Condition

`projects.ts:1247-1267` — findFirst checks org, but the actual DELETE at line 1267 uses `eq(projects.id, id)` only. TOCTOU window exists.

---

## 3. API Contract Audit

### 3.1 Missing Zod Validation

| Endpoint | File:Line | Issue |
|----------|-----------|-------|
| `POST /check-invited` | `auth.ts:222` | Raw `await c.req.json()` — crashes on empty body (`code.toUpperCase()` on undefined) |
| `POST /validate-code` | `auth.ts:243` | Same — no Zod |
| `PUT /folders/:id` | `documents.ts:112` | `const { name } = await c.req.json()` — undefined name sent to DB |
| `POST /folders/:folderId/documents` | `documents.ts:233` | Legacy multipart — FormData fields not Zod-validated |

### 3.2 Status Code Inconsistencies

- **All DELETE routes** return `200 { ok: true }` instead of `204 No Content` (systemwide, 15+ routes)
- **POST /solomon/messages** returns 200 instead of 201 for message creation

### 3.3 Response Shape Inconsistencies

- Eligibility override returns raw row (no wrapper)
- Some endpoints return `{ data: [...] }`, others return bare arrays
- Error responses mix `{ error: "msg" }` and `{ message: "msg" }`

---

## 4. Performance Issues

### 4.1 N+1 Query Hotspots

| Severity | File:Line | Description | Impact |
|----------|-----------|-------------|--------|
| **CRITICAL** | `projects.ts:493-525` | Per-element 2× findFirst (templateEl + elemDef). 100 elements = 200 queries | Every project detail load |
| HIGH | `admin.ts:100-113` | Per-user project count. 20 users = 20 extra queries | Admin page load |
| HIGH | `documents.ts:196-225` | Per-document 3× count queries. 50 docs = 150 queries | Documents page load |
| HIGH | `export.ts:20-39` | Per-project elements × per-element template. 5000 queries possible | Export |
| MEDIUM | `projects.ts:824-844` | Per-eligibility rule + doc lookups | Eligibility view |
| MEDIUM | `export.ts:81-90` | Per-project element count | Export |
| LOW | `neemia.ts:153-165` | Per-neemia-doc template lookup | Neemia list |
| LOW | `reference-tables.ts:189-221` | Per-link table/rule lookups | Reference tables |
| LOW | `projects.ts:997-1006` | Per-checklist-item template lookup | Checklist view |

**Fix pattern:** Replace per-item `findFirst` loops with batch `inArray()` queries.

### 4.2 Missing Pagination

| Endpoint | File:Line |
|----------|-----------|
| `GET /api/companies` | `companies.ts:47-52` |
| `GET /api/projects` | `projects.ts:106-109` |

Both return all records for the org with no `limit`/`offset`. Will degrade as data grows.

---

## 5. E2E Flow Tracing

### 5.1 Company Registration (Certificat Constatator)

**Flow:** HTTP upload → R2 storage → BullMQ `onrc-extract` → OCR/AI extraction → DB write → SSE notification

**Gaps found:**
| # | Issue | Severity |
|---|-------|----------|
| G1 | Associates delete+insert NOT in transaction (`processCompany.ts:156-187`) — partial data on insert failure | HIGH |
| G2 | Placeholder company `cui: "PROC-xxx"` permanent orphan on processing failure | MEDIUM |
| G3 | `populateCompanyElements` failure silently swallowed (`.catch(warn)`) | MEDIUM |
| G4 | Text truncated to 80K chars — multi-document PDFs lose tail | LOW |

### 5.2 Guide Processing

**Flow:** Upload → text extraction → AI rule extraction (chunked) → DB persistence → auto-linking

**Gaps found:**
| # | Issue | Severity |
|---|-------|----------|
| G5 | Full-replace mode deletes validated rules without warning | HIGH |
| G6 | Scoring criteria always delete-replaced even in smart merge (`processGuide.ts:499`) | MEDIUM |
| G7 | No rule count exposed via API (buried in JSONB) | LOW |

### 5.3 Template Processing

**Flow:** Upload → placeholder extraction (Python) → AI classification → visual cross-check (LibreOffice) → DB persist

**Gaps found:**
| # | Issue | Severity |
|---|-------|----------|
| G8 | Zero-placeholder documents silently succeed — no user warning | MEDIUM |
| G9 | Tmp file naming `Date.now()` can collide under 2 concurrent workers | LOW |
| G10 | LibreOffice absence silently skips visual cross-check | LOW |

### 5.4 Project Creation + Eligibility

**Flow:** Validation → transaction (project + elements from templates + guides) → checklist + eligibility seed → background AI enrichment

**Gaps found:**
| # | Issue | Severity |
|---|-------|----------|
| G11 | `agenticPrefill` and `checkEligibility` race condition (both background, no ordering) | HIGH |
| G12 | `checkEligibility()` failure silently swallowed — rules stuck as "pending" forever | HIGH |
| G13 | Per-element N+1 on project detail load (C5 from architecture audit, confirmed) | CRITICAL |

### 5.5 Delete Cascade

**Project delete cleanup:**

| Data | Cleaned | Method |
|------|---------|--------|
| project_elements | Yes | CASCADE |
| element_audit_log | Yes | CASCADE via project_elements |
| project_eligibility | Yes | CASCADE |
| project_documents (rows) | Yes | CASCADE |
| project_documents (R2 files) | Yes | Manual loop |
| project_checklist | Yes | CASCADE |
| project_scores | Yes | CASCADE |
| solomon_conversations + messages | Yes | CASCADE |
| compose_section_versions | Yes | CASCADE |
| ai_usage_log | Nullified | onDelete: "set null" (intentional) |
| **Client document R2 files** | **No** | **Not cleaned** |
| **files table rows** | **No** | **Orphaned** |

---

## 6. Data Integrity & Cascade Audit

### 6.1 FK Cascade Verification

All critical CASCADE FKs verified against `schema.ts`:

| Parent | Child | onDelete | Status |
|--------|-------|----------|--------|
| organizations → companies | cascade | OK |
| organizations → projects | cascade | OK |
| companies → company_associates | cascade | OK |
| companies → company_administrators | cascade | OK |
| companies → company_financials | cascade | OK |
| projects → project_elements | cascade | OK |
| projects → project_eligibility | cascade | OK |
| projects → project_checklist | cascade | OK |
| projects → solomon_conversations | cascade | OK |
| solomon_conversations → solomon_messages | cascade | OK |
| project_elements → template_element_id | **set null** | OK (fixed in 0116) |
| project_elements → element_def_id | **set null** | OK (fixed in 0116) |

### 6.2 Orphan Risks

1. **`files` table rows** — Never cleaned on company/project delete. R2 objects are deleted but DB rows persist.
2. **Placeholder companies** — `cui: "PROC-xxx"` records from failed ONRC processing are permanent.
3. **AI usage log** — Intentionally preserved (nullified projectId) for billing.

### 6.3 SQL Verification Script

See `scripts/verify_integrity.sql` — 8 queries to detect:
- Orphan files (no referencing entity)
- Placeholder companies stuck in "processing"/"error"
- Projects with zero elements
- Elements referencing deleted template elements
- Duplicate CUI per org
- Eligibility rows for non-existent rules
- Checklist items for non-existent projects
- Solomon conversations for non-existent projects

---

## 7. UI/UX Gaps

### 7.1 ProjectView Monolith

`apps/web/src/app/(app)/projects/[id]/page.tsx` — **5,691 lines** in a single file. Contains 7 sections (Eligibility, Solomon, Elements, Checklist, Neemia, GhidViewer, Summary) that should be separate components.

- 9 `useEffect` hooks, only 2 with cleanup — 7 potential memory leaks
- Impossible to test individual sections
- Every state change re-renders the entire 5.7K-line component

### 7.2 Missing User Feedback

| Scenario | Current behavior | Expected |
|----------|-----------------|----------|
| Template with 0 placeholders | Silently succeeds as "processed" | Warning toast |
| Guide reprocessing (full mode) | Deletes validated rules silently | Confirmation dialog |
| Eligibility check fails (background) | Rules stuck as "pending" | Error toast via SSE |
| Company processing fails | `cui: "PROC-xxx"` orphan stays | Retry/delete button |
| `populateCompanyElements` fails | Silently swallowed | Error notification |

### 7.3 Stub Sections

- **Implementare + Monitorizare** — ProjectView sidebar branches show "TBD"
- **Anexe tab** — Ghid Finanțare sub-tab is stub
- **Export & Backup** — Settings section is stub
- **Version rollback** — Neemia version history loads but no restore button

### 7.4 Duplicate Components

6 components exist in both `components/shared/` and `components/ui/`:
EmptyState, PageHeader, StatCard, StatusBadge, ProgressBar, TypeBadge

---

## 8. SQL Verification Queries

Full script at: `scripts/verify_integrity.sql`

Run against production to detect data integrity issues:
```bash
psql $DATABASE_URL -f scripts/verify_integrity.sql
```

---

## 9. Priority Matrix

### CRITICAL (fix before any deployment)

| # | Finding | Section | Effort |
|---|---------|---------|--------|
| 1 | IDOR: element/eligibility/checklist updates without org check | §2.2-2.5 | 2h |
| 2 | Unauthed `POST /api/health/run-migrations` | §1.1 | 30m |
| 3 | CNP stored plaintext (GDPR risk) | §1.5 | 2h |

### HIGH (fix within sprint)

| # | Finding | Section | Effort |
|---|---------|---------|--------|
| 4 | Rate limiting on AI endpoints | §1.2 | 2h |
| 5 | N+1 on project detail load (200 queries/page) | §4.1 | 3h |
| 6 | Associates upsert not in transaction | §5.1 G1 | 1h |
| 7 | Prefill vs eligibility race condition | §5.4 G11 | 1h |
| 8 | Eligibility failure silently swallowed | §5.4 G12 | 30m |
| 9 | Guide full-replace deletes validated rules | §5.2 G5 | 1h |
| 10 | `requireLock()` add org check | §2.1 | 1h |

### MEDIUM (next 2 sprints)

| # | Finding | Section | Effort |
|---|---------|---------|--------|
| 11 | Split ProjectView monolith (5691 lines) | §7.1 | 4h |
| 12 | Add pagination to companies/projects | §4.2 | 2h |
| 13 | Missing Zod on 4 endpoints | §3.1 | 1h |
| 14 | File upload magic-byte validation | §1.3 | 2h |
| 15 | Consolidate 6 duplicate components | §7.4 | 2h |
| 16 | Orphan cleanup (files table, placeholder companies) | §6.2 | 2h |
| 17 | Client document R2 files not cleaned on delete | §5.5 | 2h |

### LOW (backlog)

| # | Finding | Section |
|---|---------|---------|
| 18 | DELETE routes return 200 instead of 204 | §3.2 |
| 19 | Stack trace exposure on /setup-db | §1.4 |
| 20 | Tmp file naming collision risk | §5.3 G9 |
| 21 | LibreOffice absence silently skips cross-check | §5.3 G10 |
| 22 | `sanitizeForPrompt` Unicode homoglyphs | §1.6 |
| 23 | Zero-test coverage (L8 from architecture audit) | §7 |

---

## Appendix A: Route Inventory

**15 route files, 125+ endpoints.** Key files by endpoint count:
- `projects.ts` — 28 endpoints (largest, includes elements/eligibility/checklist/scores/lock)
- `documents.ts` — 16 endpoints
- `solomon.ts` — 11 endpoints
- `neemia.ts` — 12 endpoints
- `companies.ts` — 10 endpoints
- `admin.ts` — 8 endpoints
- `auth.ts` — 8 endpoints
- `templates.ts` — 7 endpoints
- `rules.ts` — 6 endpoints
- `reference-tables.ts` — 5 endpoints
- `config.ts` — 3 endpoints
- `health.ts` — 3 endpoints
- `dashboard.ts` — 1 endpoint
- `export.ts` — 2 endpoints
- `provider.ts` — 5 endpoints

## Appendix B: Auth Middleware Behavior

| Scenario | Result |
|----------|--------|
| No Authorization header | 401 `{ error: "Unauthorized" }` |
| Invalid/expired JWT | 401 `{ error: "Invalid token" }` |
| Valid JWT, user not found or disabled | 401 `{ error: "Unauthorized" }` |
| Valid JWT, org changed in DB | New org reflected (JWT carries only `sub` + `exp`) |

JWT does NOT carry `organizationId` — resolved from DB on every request (correct, prevents stale-org exploits).

## Appendix C: Test Coverage

**Current:** 4 unit test files (shared package validators), 1 E2E bash script. **Zero** API integration tests, **zero** frontend tests, **zero** E2E browser tests.
