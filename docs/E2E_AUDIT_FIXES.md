# E2E Audit — Full Issue Reference & Fix Tracker

**Date:** 2026-03-25
**Branch:** `claude/continue-enterprise-redesign-CEe4U`
**Scope:** Login → Firma → Documente → Ghid → Template → Proiect → Reguli → Solomon → Elemente → Neemia → Checklist → Export
**DB Migrations:** NONE REQUIRED — all fixes are application-level

---

## SECURITY — IDOR & Access Control

### S1: `requireLock()` missing organizationId filter
- **File:** `apps/api/src/routes/projects.ts:47-53`
- **Impact:** All endpoints using `requireLock()` inherit cross-org vulnerability
- **Fix:** Add `organizationId` parameter, filter in WHERE clause
- **Status:** [x] Fixed

### S2: PUT `/:id/elements/:eid` — no org ownership check
- **File:** `apps/api/src/routes/projects.ts:814-820`
- **Impact:** Cross-org element mutation via guessed element ID
- **Fix:** Add `verifyProjectOwnership()` before `requireLock()`
- **Status:** [x] Fixed

### S3: PUT `/:id/elements-bulk/confirm` — no org ownership check
- **File:** `apps/api/src/routes/projects.ts:924-930`
- **Impact:** Cross-org bulk element confirmation
- **Fix:** Add `verifyProjectOwnership()` before `requireLock()`
- **Status:** [x] Fixed

### S4: PUT `/:id/eligibility/:eid` — no project-scoped filter on eid
- **File:** `apps/api/src/routes/projects.ts:1153-1172`
- **Impact:** Cross-project eligibility override (attacker uses own project + other project's eid)
- **Fix:** Add `eq(projectEligibility.projectId, id)` to WHERE + add `verifyProjectOwnership()`
- **Status:** [x] Fixed

### S5: POST `/:id/checklist` — no org ownership check
- **File:** `apps/api/src/routes/projects.ts:1272-1289`
- **Impact:** Cross-org checklist item insertion
- **Fix:** Add `verifyProjectOwnership()` before `requireLock()`
- **Status:** [x] Fixed

### S6: PUT `/:id/checklist/:itemId` — no projectId filter in WHERE
- **File:** `apps/api/src/routes/projects.ts:1291-1310`
- **Impact:** Cross-project checklist item modification
- **Fix:** Add `eq(projectChecklist.projectId, id)` to WHERE + add `verifyProjectOwnership()`
- **Status:** [x] Fixed

### S7: PUT `/documents/:docId/elements/:elId` — UPDATE missing org filter
- **File:** `apps/api/src/routes/documents.ts:1014-1017`
- **Impact:** Cross-org template element mutation (SELECT checks org, UPDATE doesn't)
- **Fix:** Add `eq(templateElements.organizationId, auth.organizationId!)` to UPDATE WHERE
- **Status:** [x] Fixed

### S8: DELETE `/documents/:docId/elements/:elId` — missing org filter
- **File:** `apps/api/src/routes/documents.ts:1086-1088`
- **Impact:** Cross-org template element deletion
- **Fix:** Add `eq(templateElements.organizationId, auth.organizationId!)` to DELETE WHERE
- **Status:** [x] Fixed

---

## SECURITY — Input Validation

### V1: POST `/auth/check-invited` — no Zod validation
- **File:** `apps/api/src/routes/auth.ts:222`
- **Impact:** Unvalidated email input, potential crash
- **Fix:** Add `z.object({ email: z.string().email() }).parse()`
- **Status:** [x] Fixed

### V2: POST `/auth/validate-code` — no Zod validation
- **File:** `apps/api/src/routes/auth.ts:244`
- **Impact:** `.toUpperCase()` crashes on null/undefined
- **Fix:** Add `z.object({ code: z.string().min(1) }).parse()`
- **Status:** [x] Fixed

### V3: Login error leaks `detail: err?.message`
- **File:** `apps/api/src/routes/auth.ts:150`
- **Impact:** Internal error details exposed to client
- **Fix:** Remove `detail` field from response
- **Status:** [x] Fixed

---

## PERFORMANCE — N+1 Query Batching

### N1: GET `/:id/checklist` — per-item template lookup
- **File:** `apps/api/src/routes/projects.ts:1245-1254`
- **Impact:** 1 + N queries (N = checklist items with templateId)
- **Fix:** Batch fetch all templateIds with `inArray()`, build Map
- **Status:** [x] Fixed

### N2: GET `/export/projects` — double N+1 (projects × elements × templates)
- **File:** `apps/api/src/routes/export.ts:20-39`
- **Impact:** 1 + N + N×M queries
- **Fix:** Batch fetch all elements by projectIds, then all templates by templateElementIds
- **Status:** [x] Fixed

### N3: GET `/export/projects-csv` — per-project element count
- **File:** `apps/api/src/routes/export.ts:81-90`
- **Impact:** 1 + N queries (N = projects)
- **Fix:** Single SQL GROUP BY with count/filter aggregates
- **Status:** [x] Fixed

### N4: GET `/admin/users` — per-user project count
- **File:** `apps/api/src/routes/admin.ts:100-113`
- **Impact:** 1 + N queries (N = users)
- **Fix:** Single SQL GROUP BY on `projects.consultantId`
- **Status:** [x] Fixed

### N5: GET `/folders/:folderId/documents` — per-doc 3× count queries
- **File:** `apps/api/src/routes/documents.ts:196-225`
- **Impact:** 1 + N×3 queries (N = processed docs)
- **Fix:** Batch aggregate counts with `inArray()` + `groupBy()`
- **Status:** [x] Fixed

### N6: GET `/neemia/projects/:id/documents` — per-doc template lookup
- **File:** `apps/api/src/routes/neemia.ts:153-165`
- **Impact:** 1 + N queries (N = neemia docs)
- **Fix:** Batch fetch all templateDocumentIds upfront
- **Status:** [x] Fixed

### N7: `detectProgramContext()` — per-element template + doc lookups
- **File:** `apps/api/src/services/solomon.ts:180-207`
- **Impact:** Up to 10 extra queries per Solomon conversation init
- **Fix:** Batch fetch templateElements with `inArray()`, then batch fetch documents
- **Status:** [x] Fixed

### N8: PUT `/:id/elements-bulk/confirm` — per-element UPDATE
- **File:** `apps/api/src/routes/projects.ts:933-939`
- **Impact:** N separate UPDATEs (N = elementIds)
- **Fix:** Single UPDATE with `inArray()`
- **Status:** [x] Fixed

---

## RESILIENCE — Error Handling

### E1: Silent eligibility check error after element update
- **File:** `apps/api/src/routes/projects.ts:886-890`
- **Impact:** Frontend doesn't know eligibility check failed
- **Fix:** Include warning in SSE event
- **Status:** [x] Fixed

### E2: Neemia AI usage log `.catch()` swallows errors
- **File:** `apps/api/src/routes/neemia.ts` (AI usage logging)
- **Impact:** Cost tracking data lost silently
- **Fix:** Log error with full context (was already improved — verify)
- **Status:** [x] Verified

---

## API DESIGN

### A1: All DELETE endpoints return 200 `{ok: true}` instead of 204
- **Files:** `projects.ts`, `documents.ts`, `reference-tables.ts`, etc.
- **Impact:** Non-standard REST response
- **Fix:** Not changing — would break frontend `.json()` parsing. Document as intentional.
- **Status:** [x] Accepted (no change)

---

## TOTALS

| Category | Count | Fixed |
|----------|-------|-------|
| Security IDOR | 8 | 8/8 |
| Security Validation | 3 | 3/3 |
| Performance N+1 | 8 | 8/8 |
| Resilience | 2 | 2/2 |
| API Design | 1 | 1/1 (accepted) |
| **TOTAL** | **22** | **22/22** |
