/**
 * E2E STRUCTURAL TEST — verifică integritatea codului fără servicii externe
 *
 * NU necesită: API running, DB, Redis, AI keys
 * Verifică: imports, exports, funcții existente, endpoint-uri, flow-uri complete
 *
 * Usage: npx tsx scripts/e2e-structural-test.ts
 */
import * as fs from "fs";
import * as path from "path";

const API_SRC = path.resolve(__dirname, "../apps/api/src");
const WEB_SRC = path.resolve(__dirname, "../apps/web/src");

interface TestResult {
  category: string;
  test: string;
  status: "PASS" | "FAIL";
  details: string;
}

const results: TestResult[] = [];

function test(category: string, name: string, fn: () => boolean | string) {
  try {
    const result = fn();
    const pass = result === true;
    results.push({ category, test: name, status: pass ? "PASS" : "FAIL", details: typeof result === "string" ? result : "" });
    console.log(`  ${pass ? "✅" : "❌"} ${name}${typeof result === "string" ? `: ${result}` : ""}`);
  } catch (e: any) {
    results.push({ category, test: name, status: "FAIL", details: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function fileContains(filePath: string, pattern: string | RegExp): boolean {
  const content = fs.readFileSync(filePath, "utf-8");
  return typeof pattern === "string" ? content.includes(pattern) : pattern.test(content);
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  1. SCHEMA — Tabele RAG v2 + Forms + Memory");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

const schemaPath = path.join(API_SRC, "db/schema.ts");
test("Schema", "chunks table exists", () => fileContains(schemaPath, 'pgTable("chunks"'));
test("Schema", "chunks has vector1024 embedding", () => fileContains(schemaPath, "vector1024"));
test("Schema", "solomonEligibility table", () => fileContains(schemaPath, 'pgTable("solomon_eligibility"'));
test("Schema", "solomonScoring table", () => fileContains(schemaPath, 'pgTable("solomon_scoring"'));
test("Schema", "solomonCaseMemory table", () => fileContains(schemaPath, 'pgTable("solomon_case_memory"'));
test("Schema", "formSpecs table", () => fileContains(schemaPath, 'pgTable("form_specs"'));
test("Schema", "formData table", () => fileContains(schemaPath, 'pgTable("form_data"'));
test("Schema", "documents.classification JSONB", () => fileContains(schemaPath, "classification: jsonb"));
test("Schema", "documents.documentVersion", () => fileContains(schemaPath, 'documentVersion: integer("document_version"'));
test("Schema", "documents.versionDiff", () => fileContains(schemaPath, "versionDiff: jsonb"));
test("Schema", "projects.solomonPhase JSONB", () => fileContains(schemaPath, 'solomonPhase: jsonb("solomon_phase"'));
test("Schema", "projects.composeBrief JSONB", () => fileContains(schemaPath, 'composeBrief: jsonb("compose_brief"'));
test("Schema", "conversations.summary", () => fileContains(schemaPath, 'summary: text("summary"'));

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  2. MIGRATIONS — 0128-0135");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

const migDir = path.join(API_SRC, "db/migrations");
for (const m of ["0128_rag_v2_chunks", "0129_rag_v2_classification", "0130_rag_v2_solomon_phase", "0131_rag_v2_versioning", "0132_solomon_structured_output", "0133_form_specs", "0134_form_data", "0135_solomon_persistent_memory"]) {
  test("Migrations", m, () => fileExists(path.join(migDir, `${m}.sql`)));
}

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  3. RAG v2 SERVICES");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

test("Services", "voyageEmbeddings.ts exists", () => fileExists(path.join(API_SRC, "services/voyageEmbeddings.ts")));
test("Services", "hybridSearch.ts exists", () => fileExists(path.join(API_SRC, "services/hybridSearch.ts")));
test("Services", "documentClassifier.ts exists", () => fileExists(path.join(API_SRC, "services/documentClassifier.ts")));
test("Services", "ragChunker.ts exists", () => fileExists(path.join(API_SRC, "services/ragChunker.ts")));
test("Services", "metadataEnricher.ts exists", () => fileExists(path.join(API_SRC, "services/metadataEnricher.ts")));
test("Services", "dataExtractor.ts exists", () => fileExists(path.join(API_SRC, "services/dataExtractor.ts")));
test("Services", "ingestDocument.ts exists", () => fileExists(path.join(API_SRC, "services/ingestDocument.ts")));
test("Services", "solomonTools.ts exists", () => fileExists(path.join(API_SRC, "services/solomonTools.ts")));
test("Services", "versionDiff.ts exists", () => fileExists(path.join(API_SRC, "services/versionDiff.ts")));
test("Services", "documentVersionUpgrade.ts exists", () => fileExists(path.join(API_SRC, "services/documentVersionUpgrade.ts")));
test("Services", "formSpecExtractor.ts exists", () => fileExists(path.join(API_SRC, "services/formSpecExtractor.ts")));
test("Services", "formspec_extract.py exists", () => fileExists(path.join(API_SRC, "services/formspec_extract.py")));

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  4. SOLOMON — Tool Use + Phases + Structured Output");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

const solomonPath = path.join(API_SRC, "services/solomon.ts");
test("Solomon", "search_knowledge tool imported", () => fileContains(solomonPath, "SOLOMON_TOOLS"));
test("Solomon", "executeSolomonTool imported", () => fileContains(solomonPath, "executeSolomonTool"));
test("Solomon", "tool use loop (MAX_TOOL_ROUNDS)", () => fileContains(solomonPath, "MAX_TOOL_ROUNDS"));
test("Solomon", "PHASE_JSON parsing", () => fileContains(solomonPath, "PHASE_JSON"));
test("Solomon", "ELIGIBILITY_JSON parsing", () => fileContains(solomonPath, "ELIGIBILITY_JSON"));
test("Solomon", "SCORING_JSON parsing", () => fileContains(solomonPath, "SCORING_JSON"));
test("Solomon", "CHECKLIST_JSON parsing", () => fileContains(solomonPath, "CHECKLIST_JSON"));
test("Solomon", "SIGNAL_JSON parsing", () => fileContains(solomonPath, "SIGNAL_JSON"));
test("Solomon", "regression in PHASE_JSON", () => fileContains(solomonPath, "regression"));
test("Solomon", "Q0 structured (problema_client)", () => fileContains(solomonPath, "problema_client"));
test("Solomon", "Q10 Finalizare", () => fileContains(solomonPath, "FINALIZARE"));
test("Solomon", "Q11 Post-depunere", () => fileContains(solomonPath, "POST-DEPUNERE"));
test("Solomon", "persistent memory (prevConvs)", () => fileContains(solomonPath, "prevConvs"));
test("Solomon", "tool results saved to DB", () => fileContains(solomonPath, "Căutare automată"));
test("Solomon", "history limit 100", () => fileContains(solomonPath, "limit: 100"));

// Security checks
test("Solomon", "SECURITY: project queries have organizationId", () => {
  const content = fs.readFileSync(solomonPath, "utf-8");
  const unscoped = content.match(/where: eq\(projects\.id, projectId\)\)/g);
  return !unscoped || unscoped.length === 0 ? true : `${unscoped.length} unscoped project queries`;
});

// Old injections disabled
test("Solomon", "OLD: solomonKnowledge query commented", () => fileContains(solomonPath, "// try { knowledgeEntries"));
test("Solomon", "OLD: processGuide calls commented", () => {
  const docPath = path.join(API_SRC, "routes/documents.ts");
  const content = fs.readFileSync(docPath, "utf-8");
  const active = content.match(/^\s*await processGuideQueue\.add/gm);
  return !active || active.length === 0 ? true : `${active.length} active processGuide calls`;
});
test("Solomon", "OLD: auto eligibility commented", () => fileContains(solomonPath, "// RAG v2: Auto eligibility"));
test("Solomon", "OLD: RAG injection commented", () => fileContains(solomonPath, "// RAG v2: Solomon uses tool_use"));

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  5. ROUTES — API Endpoints");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

const solomonRoutes = path.join(API_SRC, "routes/solomon.ts");
test("Routes", "GET /phase", () => fileContains(solomonRoutes, "/phase"));
test("Routes", "POST /compose-brief", () => fileContains(solomonRoutes, "/compose-brief"));
test("Routes", "GET /eligibility", () => fileContains(solomonRoutes, "/eligibility"));
test("Routes", "GET /scoring", () => fileContains(solomonRoutes, "/scoring"));
test("Routes", "GET /document-checklist", () => fileContains(solomonRoutes, "/document-checklist"));
test("Routes", "POST /generate-summary", () => fileContains(solomonRoutes, "/generate-summary"));
test("Routes", "GET /memory", () => fileContains(solomonRoutes, "/memory"));

const docRoutes = path.join(API_SRC, "routes/documents.ts");
test("Routes", "GET /classified-documents", () => fileContains(docRoutes, "/classified-documents"));
test("Routes", "PUT /reclassify", () => fileContains(docRoutes, "/reclassify"));
test("Routes", "POST /confirm-upgrade", () => fileContains(docRoutes, "/confirm-upgrade"));
test("Routes", "GET /versions", () => fileContains(docRoutes, "/versions"));
test("Routes", "ingestDocumentQueue dispatched", () => fileContains(docRoutes, "ingestDocumentQueue.add"));

const formRoutes = path.join(API_SRC, "routes/forms.ts");
test("Routes", "POST /forms/extract", () => fileContains(formRoutes, '"/extract"'));
test("Routes", "GET /forms/spec/:id", () => fileContains(formRoutes, '"/spec/:formSpecId"'));
test("Routes", "POST /forms/export", () => fileContains(formRoutes, "/export"));
test("Routes", "POST /forms/approve-page", () => fileContains(formRoutes, "/approve-page"));
test("Routes", "POST /forms/auto-populate", () => fileContains(formRoutes, "/auto-populate"));

const configRoutes = path.join(API_SRC, "routes/config.ts");
test("Routes", "POST /knowledge-base/upload", () => fileContains(configRoutes, "/knowledge-base/upload"));
test("Routes", "GET /knowledge-base", () => fileContains(configRoutes, '"/knowledge-base"'));

const neemiaRoutes = path.join(API_SRC, "routes/neemia.ts");
test("Routes", "POST /compose/generate-section", () => fileContains(neemiaRoutes, "/compose/generate-section"));
test("Routes", "POST /compose/coherence-check", () => fileContains(neemiaRoutes, "/compose/coherence-check"));

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  6. FRONTEND — SSE Handlers + UI Components");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

const projectPage = path.join(WEB_SRC, "app/(app)/projects/[id]/page.tsx");
test("Frontend", "SSE: tool_use handler", () => fileContains(projectPage, 'evt.type === "tool_use"'));
test("Frontend", "SSE: phase_update handler", () => fileContains(projectPage, 'evt.type === "phase_update"'));
test("Frontend", "SSE: eligibility_update handler", () => fileContains(projectPage, 'evt.type === "eligibility_update"'));
test("Frontend", "SSE: scoring_update handler", () => fileContains(projectPage, 'evt.type === "scoring_update"'));
test("Frontend", "SSE: checklist_update handler", () => fileContains(projectPage, 'evt.type === "checklist_update"'));
test("Frontend", "SSE: signal handler", () => fileContains(projectPage, 'evt.type === "signal"'));
test("Frontend", "Source trail state", () => fileContains(projectPage, "solomonSourceTrail"));
test("Frontend", "Signals state", () => fileContains(projectPage, "solomonSignals"));
test("Frontend", "Version impact banner", () => fileContains(projectPage, "versionImpact"));
test("Frontend", "composeBrief button", () => fileContains(projectPage, "compose-brief"));
test("Frontend", "solChecklist rendered", () => fileContains(projectPage, "Documente necesare"));
test("Frontend", "Solomon eligibility panel", () => fileContains(projectPage, "Eligibilitate (Solomon)"));
test("Frontend", "Solomon scoring table", () => fileContains(projectPage, "Punctaj estimat (Solomon)"));
test("Frontend", "Phase regression indicator", () => fileContains(projectPage, "regression"));

const docsPage = path.join(WEB_SRC, "app/(app)/documents/page.tsx");
test("Frontend", "Session upload zone", () => fileContains(docsPage, "uploadFilesToSession"));
test("Frontend", "Parallel upload (Promise.allSettled)", () => fileContains(docsPage, "Promise.allSettled"));
test("Frontend", "Classified docs grouped", () => fileContains(docsPage, "renderSection"));
test("Frontend", "Leaf folders hidden", () => fileContains(docsPage, "HIDDEN_LEAF_TYPES"));
test("Frontend", "KB upload on new endpoint", () => {
  const settingsPage = path.join(WEB_SRC, "app/(app)/settings/page.tsx");
  return fileContains(settingsPage, "knowledge-base/upload");
});

// ═══════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════");
console.log("  7. WORKER — Jobs registered");
console.log("═══════════════════════════════════════════════════════");
// ═══════════════════════════════════════════════════════

const workerPath = path.join(API_SRC, "jobs/worker.ts");
test("Worker", "ingestDocumentWorker registered", () => fileContains(workerPath, "ingestDocumentWorker"));
test("Worker", "ingestDocumentWorker graceful shutdown", () => fileContains(workerPath, "ingestDocumentWorker.close"));

const queuePath = path.join(API_SRC, "lib/queue.ts");
test("Queue", "ingestDocumentQueue defined", () => fileContains(queuePath, "ingestDocumentQueue"));
test("Queue", "INGEST priority", () => fileContains(queuePath, "INGEST"));

// ═══════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════
const pass = results.filter(r => r.status === "PASS").length;
const fail = results.filter(r => r.status === "FAIL").length;

console.log(`\n${"═".repeat(55)}`);
console.log(`  RAPORT: ✅ ${pass} PASS  ❌ ${fail} FAIL  (total: ${results.length})`);
console.log(`${"═".repeat(55)}`);

if (fail > 0) {
  console.log("\n  EȘECURI:");
  for (const r of results.filter(r => r.status === "FAIL")) {
    console.log(`    ❌ [${r.category}] ${r.test}${r.details ? `: ${r.details}` : ""}`);
  }
}

console.log();
process.exit(fail > 0 ? 1 : 0);
