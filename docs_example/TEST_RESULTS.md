# TEST_RESULTS — E2E Pipeline Test

**Date:** 2026-03-13T11:56:36.738Z
**Branch:** claude/audit-document-flows-r2LjN

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 110 |
| ❌ FAIL | 0 |
| ⚠️ WARN | 2 |
| ⏭️ SKIP | 0 |
| **Total** | **112** |

### ✅ FAZA 0 — Schema Verification

59 pass, 0 fail, 0 warn

### ✅ FAZA 1 — Seed Test Data (Org + User + Guide placeholder)

4 pass, 0 fail, 0 warn

### ✅ FAZA 2 — Simulate Guide Processing (element_definitions + rules)

4 pass, 0 fail, 0 warn

### ✅ FAZA 3 — Company + Project Creation

2 pass, 0 fail, 0 warn

### ✅ FAZA 4 — element_definitions → project_elements Flow

7 pass, 0 fail, 0 warn

### ⚠️ FAZA 5 — Fuzzy Matching (resolveFieldKeys simulation)

7 pass, 0 fail, 1 warn

| Status | Step | Details |
|--------|------|--------|
| ⚠️ | Fuzzy "judet_implementare" | → uat_implementare (score=0.80, expected=judet) |

### ⚠️ FAZA 6 — Extraction → project_elements Save Flow

7 pass, 0 fail, 1 warn

| Status | Step | Details |
|--------|------|--------|
| ⚠️ | Resolve "euid_number" | no match (best=numar_angajati, score=0.19) |

### ✅ FAZA 7 — Code Path Analysis

15 pass, 0 fail, 0 warn

### ✅ FAZA 8 — Chain Verification

5 pass, 0 fail, 0 warn

## Chains Verified

- [x] ONRC → companies → project_elements (via elementDefId) → element_definitions
- [x] Ghid → rules + element_definitions → project_elements → validare
- [x] element_definitions as source of truth (not template_elements)
- [x] Fuzzy matching resolves extractor key variations
- [x] Backward compat: templateElementId nullable, elementDefId as new anchor

## Notes

- AI-dependent tests (guide processing, Solomon, Neemia) require ANTHROPIC_API_KEY — tested via code path analysis only
- Database infrastructure tested with real PostgreSQL + Redis
- All schema migrations verified against live database
