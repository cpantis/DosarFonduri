-- ═══════════════════════════════════════════════════════════
-- DosarFonduri — DATA INTEGRITY VERIFICATION SCRIPT
-- Date: 2026-03-23
-- Usage: psql -f scripts/verify_integrity.sql
-- All queries are READ-ONLY (SELECT only). Safe to run on production.
-- ═══════════════════════════════════════════════════════════

-- 1. Orphan project_elements (project deleted but elements remain)
SELECT 'ORPHAN project_elements' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM project_elements pe
LEFT JOIN projects p ON pe.project_id = p.id
WHERE p.id IS NULL;

-- 2. Orphan documents (folder deleted but documents remain)
SELECT 'ORPHAN documents (no folder)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM documents d
LEFT JOIN document_folders df ON d.folder_id = df.id
WHERE df.id IS NULL;

-- 3. Companies without a valid organization
SELECT 'ORPHAN companies (no org)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM companies c
LEFT JOIN organizations o ON c.organization_id = o.id
WHERE o.id IS NULL;

-- 4. Duplicate CUI within same organization (should be 0 due to unique index)
SELECT 'DUPLICATE CUI per org' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' duplicates' END AS result
FROM (
  SELECT cui, organization_id, COUNT(*) AS cnt
  FROM companies
  GROUP BY cui, organization_id
  HAVING COUNT(*) > 1
) dupes;

-- 5. Fully unlinked project_elements (no elementDefId AND no templateElementId)
SELECT 'UNLINKED project_elements' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING: ' || COUNT(*) || ' unlinked elements' END AS result
FROM project_elements
WHERE element_def_id IS NULL AND template_element_id IS NULL;

-- 6. Solomon conversations referencing deleted projects
SELECT 'ORPHAN solomon_conversations' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM solomon_conversations sc
LEFT JOIN projects p ON sc.project_id = p.id
WHERE p.id IS NULL;

-- 7. Rules referencing deleted guide documents
SELECT 'ORPHAN rules (no document)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM rules r
LEFT JOIN documents d ON r.document_id = d.id
WHERE d.id IS NULL;

-- 8. Project eligibility rows referencing deleted rules
SELECT 'ORPHAN project_eligibility (no rule)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM project_eligibility pe
LEFT JOIN rules r ON pe.rule_id = r.id
WHERE r.id IS NULL;

-- 9. Template placeholder mappings pointing to deleted element_definitions
SELECT 'ORPHAN template_placeholder_mapping' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM template_placeholder_mapping tpm
LEFT JOIN element_definitions ed ON tpm.element_def_id = ed.id
WHERE ed.id IS NULL;

-- 10. Element rule links where both anchors are null
SELECT 'UNLINKED element_rule_links' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING: ' || COUNT(*) || ' fully unlinked' END AS result
FROM element_rule_links
WHERE template_element_id IS NULL AND element_def_id IS NULL;

-- 11. Users with org_id pointing to non-existent org
SELECT 'ORPHAN users (no org)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.organization_id IS NOT NULL AND o.id IS NULL;

-- 12. Projects referencing deleted companies
SELECT 'ORPHAN projects (no company)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM projects p
LEFT JOIN companies c ON p.company_id = c.id
WHERE c.id IS NULL;

-- 13. Projects referencing deleted folders
SELECT 'ORPHAN projects (no folder)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM projects p
LEFT JOIN document_folders df ON p.folder_id = df.id
WHERE df.id IS NULL;

-- 14. Generated docs (project_documents) with no file in files table
SELECT 'ORPHAN project_documents (no file)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING: ' || COUNT(*) || ' missing files' END AS result
FROM project_documents pd
LEFT JOIN files f ON pd.generated_file_id = f.id
WHERE pd.generated_file_id IS NOT NULL AND f.id IS NULL;

-- 15. Scoring criteria referencing deleted documents
SELECT 'ORPHAN scoring_criteria (no document)' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'PROBLEM: ' || COUNT(*) || ' orphans' END AS result
FROM scoring_criteria sc
LEFT JOIN documents d ON sc.document_id = d.id
WHERE d.id IS NULL;

-- 16. Table counts summary
SELECT 'TABLE COUNTS' AS check_name,
  'orgs=' || (SELECT COUNT(*) FROM organizations) ||
  ' users=' || (SELECT COUNT(*) FROM users) ||
  ' companies=' || (SELECT COUNT(*) FROM companies) ||
  ' projects=' || (SELECT COUNT(*) FROM projects) ||
  ' documents=' || (SELECT COUNT(*) FROM documents) ||
  ' rules=' || (SELECT COUNT(*) FROM rules) ||
  ' elem_defs=' || (SELECT COUNT(*) FROM element_definitions) ||
  ' proj_elements=' || (SELECT COUNT(*) FROM project_elements) ||
  ' conversations=' || (SELECT COUNT(*) FROM solomon_conversations) ||
  ' gen_docs=' || (SELECT COUNT(*) FROM project_documents)
  AS result;
