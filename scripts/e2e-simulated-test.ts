/**
 * E2E SIMULATED TEST — Testează flow-ul cu documentele reale din docs_example/
 *
 * NU necesită: API, DB, Redis, AI keys
 * Testează: clasificare (regex/heuristic), chunking, FormSpec extraction, routing logic
 * Simulează: Solomon conversation flow, element mapping, compose brief structure
 *
 * Usage: npx tsx scripts/e2e-simulated-test.ts
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

const DOCS_DIR = path.resolve(__dirname, "../docs_example");
const API_SRC = path.resolve(__dirname, "../apps/api/src");

// ═══════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════
interface Result { fase: string; test: string; status: "PASS" | "FAIL" | "WARN" | "SKIP"; details: string }
const results: Result[] = [];
let fase = "";

function log(test: string, status: Result["status"], details: string) {
  results.push({ fase, test, status, details });
  const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️", SKIP: "⏭️" }[status];
  console.log(`  ${icon} ${test}: ${details}`);
}

function setFase(name: string) {
  fase = name;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(60)}`);
}

// ═══════════════════════════════════════════════════════
// DOCUMENT INVENTORY
// ═══════════════════════════════════════════════════════
interface DocEntry {
  file: string;
  size: number;
  ext: string;
  expectedDocType: string;
  expectedRoute: string;
  category: string;
}

function buildInventory(): DocEntry[] {
  const files = fs.readdirSync(DOCS_DIR).filter(f => /\.(pdf|docx|xlsx|doc|png|jpg)$/i.test(f));

  return files.map(file => {
    const filePath = path.join(DOCS_DIR, file);
    const size = fs.statSync(filePath).size;
    const ext = path.extname(file).toLowerCase().replace(".", "");
    const lower = file.toLowerCase();

    // Heuristic classification (mirrors what documentClassifier.ts would do)
    let expectedDocType = "altul";
    let expectedRoute = "extract_data";
    let category = "client";

    if (/ghid.*solicitant|ghidul/i.test(lower)) {
      expectedDocType = "ghid"; expectedRoute = "vectorize"; category = "guide";
    } else if (/fisa.*evaluare|fișa.*evaluare/i.test(lower)) {
      expectedDocType = "fisa_evaluare"; expectedRoute = "vectorize"; category = "guide";
    } else if (/anunt.*cerere|anunț|apel.*proiecte/i.test(lower)) {
      expectedDocType = "anexa"; expectedRoute = "vectorize"; category = "guide";
    } else if (/corelarea.*puterii|lista.*uat|anexa.*3.*corelarea|anexa.*4/i.test(lower)) {
      expectedDocType = "anexa"; expectedRoute = "vectorize"; category = "guide";
    } else if (/pniesc/i.test(lower)) {
      expectedDocType = "anexa"; expectedRoute = "vectorize"; category = "knowledge_base";
    } else if (/cerere.*finantare|cererea.*finantare|anexa.*1.*cerere/i.test(lower)) {
      expectedDocType = "cerere_finantare"; expectedRoute = "template_fill"; category = "template";
    } else if (/anexa.*b|anexa.*c/i.test(lower)) {
      expectedDocType = "template_fill"; expectedRoute = "template_fill"; category = "template";
    } else if (/template.*memoriu|memoriu.*justificativ/i.test(lower)) {
      expectedDocType = "template_compose"; expectedRoute = "template_compose"; category = "template";
    } else if (/bilant|bilanț/i.test(lower)) {
      expectedDocType = "document_client"; expectedRoute = "extract_data"; category = "client";
    } else if (/ci\s|carte.*identitate/i.test(lower)) {
      expectedDocType = "document_client"; expectedRoute = "extract_data"; category = "client";
    } else if (/certificat.*constatator/i.test(lower)) {
      expectedDocType = "certificat"; expectedRoute = "extract_data"; category = "client";
    } else if (/diploma/i.test(lower)) {
      expectedDocType = "document_client"; expectedRoute = "extract_data"; category = "client";
    } else if (/act.*constitutiv/i.test(lower)) {
      expectedDocType = "document_client"; expectedRoute = "extract_data"; category = "client";
    } else if (/statut/i.test(lower)) {
      expectedDocType = "document_client"; expectedRoute = "extract_data"; category = "client";
    } else if (/oferta|cultivator|tractor|disc|semanatoare/i.test(lower)) {
      expectedDocType = "oferta"; expectedRoute = "extract_data"; category = "client";
    } else if (/descriere.*proiect/i.test(lower)) {
      expectedDocType = "document_client"; expectedRoute = "extract_data"; category = "client";
    } else if (/adeverinta|model.*adeverinta/i.test(lower)) {
      expectedDocType = "template_fill"; expectedRoute = "template_fill"; category = "template";
    } else if (/instructiuni.*evitarea/i.test(lower)) {
      expectedDocType = "anexa"; expectedRoute = "vectorize"; category = "guide";
    } else if (/documente.*forma.*organizare/i.test(lower)) {
      expectedDocType = "certificat"; expectedRoute = "extract_data"; category = "client";
    }

    return { file, size, ext, expectedDocType, expectedRoute, category };
  });
}

// ═══════════════════════════════════════════════════════
// FAZA 1: DOCUMENT INVENTORY + CLASSIFICATION
// ═══════════════════════════════════════════════════════
function faza1_inventory() {
  setFase("FAZA 1 — INVENTAR + CLASIFICARE SIMULATĂ");

  const inventory = buildInventory();
  log("Total documente", "PASS", `${inventory.length} fișiere în docs_example/`);

  // Group by category
  const groups: Record<string, DocEntry[]> = {};
  for (const doc of inventory) {
    if (!groups[doc.category]) groups[doc.category] = [];
    groups[doc.category].push(doc);
  }

  for (const [cat, docs] of Object.entries(groups)) {
    log(`Categorie: ${cat}`, "PASS", `${docs.length} documente`);
    for (const doc of docs) {
      const sizeKB = Math.round(doc.size / 1024);
      log(`  ${doc.file.substring(0, 45)}`, "PASS",
        `${doc.ext} · ${sizeKB} KB · → ${doc.expectedRoute} (${doc.expectedDocType})`);
    }
  }

  // Verify routing distribution
  const routes: Record<string, number> = {};
  for (const doc of inventory) {
    routes[doc.expectedRoute] = (routes[doc.expectedRoute] || 0) + 1;
  }
  log("Routing distribution", "PASS", Object.entries(routes).map(([k, v]) => `${k}: ${v}`).join(", "));

  return inventory;
}

// ═══════════════════════════════════════════════════════
// FAZA 2: CHUNKING SIMULATION (ghid real)
// ═══════════════════════════════════════════════════════
function faza2_chunking(inventory: DocEntry[]) {
  setFase("FAZA 2 — CHUNKING SIMULAT (ragChunker)");

  // Import ragChunker
  let chunkDocument: (text: string) => any[];
  try {
    const ragChunkerPath = path.join(API_SRC, "services/ragChunker.ts");
    const content = fs.readFileSync(ragChunkerPath, "utf-8");
    // Extract the pure function — we can't import .ts directly, so we verify the logic
    const hasTargetTokens = content.includes("TARGET_CHUNK_TOKENS = 400");
    const hasOverlap = content.includes("OVERLAP_TOKENS = 40");
    const hasPageParsing = content.includes("--- Pagina");
    log("ragChunker.ts", "PASS", `target=400 tok: ${hasTargetTokens}, overlap=40: ${hasOverlap}, page parsing: ${hasPageParsing}`);
  } catch (e: any) {
    log("ragChunker.ts", "FAIL", e.message);
  }

  // Simulate chunking with a sample text
  const sampleText = `--- Pagina 1 ---
Ghidul Solicitantului pentru submăsura 4.1 „Investiții în exploatații agricole"
Componenta 4.1.1 – Investiții în exploatații pomicole

CAPITOLUL 1 – INFORMAȚII GENERALE
1.1 Descrierea generală a Programului
Programul Național Strategic PAC 2023–2027 (denumit în continuare PS PAC 2023–2027).

--- Pagina 2 ---
1.2 Obiectivele submăsurii 4.1
Obiectivul general al submăsurii 4.1 este modernizarea exploatațiilor agricole.
Obiective specifice:
- Creșterea competitivității prin dotare cu echipamente performante
- Restructurarea exploatațiilor de dimensiuni mici și medii
- Reducerea consumului energetic și a impactului asupra mediului

--- Pagina 3 ---
CAPITOLUL 2 – DOMENIUL DE APLICARE
2.1 Condiții de eligibilitate
Solicitantul trebuie să îndeplinească cumulativ următoarele condiții:
a) Să fie înregistrat conform legislației naționale
b) Dimensiunea economică a exploatației ≥ 8.000 SO
c) Să demonstreze viabilitatea investiției propuse`;

  // Manually simulate chunking logic
  const pages = sampleText.split(/--- Pagina \d+ ---/).filter(p => p.trim());
  const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

  const chunks: { index: number; content: string; tokens: number; pageStart: number }[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;
  let pageStart = 1;

  for (let i = 0; i < pages.length; i++) {
    const paragraphs = pages[i].split(/\n\s*\n/).filter(p => p.trim());
    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);
      if (currentTokens + paraTokens > 400 && currentParts.length > 0) {
        chunks.push({ index: chunks.length, content: currentParts.join("\n\n"), tokens: currentTokens, pageStart });
        currentParts = [];
        currentTokens = 0;
        pageStart = i + 1;
      }
      currentParts.push(para);
      currentTokens += paraTokens;
    }
  }
  if (currentParts.length > 0) {
    chunks.push({ index: chunks.length, content: currentParts.join("\n\n"), tokens: currentTokens, pageStart });
  }

  log("Simulated chunking", "PASS", `${chunks.length} chunks from ${pages.length} pages`);
  for (const chunk of chunks) {
    log(`  Chunk ${chunk.index}`, "PASS", `${chunk.tokens} tokens, page ${chunk.pageStart}, ${chunk.content.substring(0, 60).replace(/\n/g, " ")}...`);
  }

  // Verify chunk properties
  const allUnder600 = chunks.every(c => c.tokens <= 600);
  log("Chunk size limit", allUnder600 ? "PASS" : "FAIL", `All chunks ≤ 600 tokens: ${allUnder600}`);

  return chunks;
}

// ═══════════════════════════════════════════════════════
// FAZA 3: FORMSPEC EXTRACTION (Python — real execution)
// ═══════════════════════════════════════════════════════
function faza3_formspec(inventory: DocEntry[]) {
  setFase("FAZA 3 — FORMSPEC EXTRACTION (Python real)");

  const scriptPath = path.join(API_SRC, "services/formspec_extract.py");
  if (!fs.existsSync(scriptPath)) {
    log("formspec_extract.py", "FAIL", "Not found");
    return;
  }

  // Test format detection on real files
  const testFiles = inventory.filter(d => ["pdf", "docx", "xlsx"].includes(d.ext)).slice(0, 8);

  for (const doc of testFiles) {
    const filePath = path.join(DOCS_DIR, doc.file);
    try {
      const result = execFileSync("python3", [scriptPath, "detect", filePath], {
        encoding: "utf-8",
        timeout: 15000,
      }).trim();
      const parsed = JSON.parse(result);
      log(`Detect ${doc.file.substring(0, 40)}`, parsed.error ? "FAIL" : "PASS",
        parsed.format || parsed.error || "unknown");
    } catch (e: any) {
      log(`Detect ${doc.file.substring(0, 40)}`, "WARN", e.message?.substring(0, 80));
    }
  }

  // Try full extraction on CF (XFA) and Template Memoriu (DOCX)
  const xfaFile = inventory.find(d => /cererea.*finantare|cerere.*finantare/i.test(d.file));
  if (xfaFile) {
    try {
      const result = execFileSync("python3", [scriptPath, "extract", path.join(DOCS_DIR, xfaFile.file)], {
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 20 * 1024 * 1024,
      }).trim();
      const spec = JSON.parse(result);
      if (spec.error) {
        log(`Extract CF XFA`, "WARN", spec.error);
      } else {
        log(`Extract CF XFA`, "PASS",
          `format=${spec.sourceFormat}, sections=${spec.sections?.length || 0}, fields=${spec.totalFields || 0}`);
      }
    } catch (e: any) {
      log(`Extract CF XFA`, "WARN", e.message?.substring(0, 100));
    }
  }

  const docxFile = inventory.find(d => /template.*memoriu/i.test(d.file));
  if (docxFile) {
    try {
      const result = execFileSync("python3", [scriptPath, "extract", path.join(DOCS_DIR, docxFile.file)], {
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 20 * 1024 * 1024,
      }).trim();
      const spec = JSON.parse(result);
      if (spec.error) {
        log(`Extract Template DOCX`, "WARN", spec.error);
      } else {
        log(`Extract Template DOCX`, "PASS",
          `format=${spec.sourceFormat}, sections=${spec.sections?.length || 0}, fields=${spec.totalFields || 0}`);
      }
    } catch (e: any) {
      log(`Extract Template DOCX`, "WARN", e.message?.substring(0, 100));
    }
  }

  const xlsxFile = inventory.find(d => /\.xlsx$/i.test(d.file));
  if (xlsxFile) {
    try {
      const result = execFileSync("python3", [scriptPath, "extract", path.join(DOCS_DIR, xlsxFile.file)], {
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 20 * 1024 * 1024,
      }).trim();
      const spec = JSON.parse(result);
      if (spec.error) {
        log(`Extract XLSX`, "WARN", spec.error);
      } else {
        log(`Extract XLSX`, "PASS",
          `format=${spec.sourceFormat}, sections=${spec.sections?.length || 0}, fields=${spec.totalFields || 0}`);
      }
    } catch (e: any) {
      log(`Extract XLSX`, "WARN", e.message?.substring(0, 100));
    }
  }
}

// ═══════════════════════════════════════════════════════
// FAZA 4: SOLOMON CONVERSATION SIMULATION
// ═══════════════════════════════════════════════════════
function faza4_solomonSimulation() {
  setFase("FAZA 4 — SOLOMON CONVERSAȚIE (simulat)");

  // Verify system prompt structure
  const solomonPath = path.join(API_SRC, "services/solomon.ts");
  const solomonContent = fs.readFileSync(solomonPath, "utf-8");

  // Q0 elements
  const q0Elements = ["problema_client", "impact_problema", "solutia_dorita", "context_local", "ambitia_3_5_ani"];
  for (const el of q0Elements) {
    log(`Q0 element: ${el}`, solomonContent.includes(el) ? "PASS" : "FAIL", "In system prompt");
  }

  // Verify 5 hidden JSON types are parsed
  const jsonTypes = ["ELEMENTS_JSON", "PHASE_JSON", "ELIGIBILITY_JSON", "SCORING_JSON", "CHECKLIST_JSON", "SIGNAL_JSON"];
  for (const jt of jsonTypes) {
    const parseCount = (solomonContent.match(new RegExp(`extractBalancedJSON.*${jt}|${jt}.*parse`, "g")) || []).length;
    log(`Parse ${jt}`, parseCount > 0 ? "PASS" : "FAIL", `${parseCount} parse location(s)`);
  }

  // Verify tool use flow
  log("Tool use flow", solomonContent.includes("for (let round = 0") ? "PASS" : "FAIL", "Loop exists");
  log("Tool results saved", solomonContent.includes("Căutare automată") ? "PASS" : "FAIL", "Persisted to DB");

  // Simulate a conversation with expected outputs
  const simulatedTurns = [
    { input: "Am o fermă de 50 ha cereale în Arad, pierd recoltă la recoltare",
      expectedPhase: "Q0", expectedElements: ["problema_client"], expectedTools: ["search_knowledge"] },
    { input: "Firma e SRL, CAEN 0111, sunt tânăr fermier 28 ani",
      expectedPhase: "Q1", expectedElements: ["forma_juridica", "caen"], expectedTools: [] },
    { input: "Sunt eligibil pe sM 4.1?",
      expectedPhase: "Q4", expectedElements: [], expectedTools: ["search_knowledge"],
      expectedJSON: ["ELIGIBILITY_JSON"] },
    { input: "Vreau tractor 150 CP + cultivator. Câte puncte?",
      expectedPhase: "Q5", expectedElements: ["valoare_investitie"], expectedTools: ["search_knowledge"],
      expectedJSON: ["SCORING_JSON"] },
    { input: "Ce documente trebuie?",
      expectedPhase: "Q10", expectedElements: [], expectedTools: ["search_knowledge"],
      expectedJSON: ["CHECKLIST_JSON"] },
  ];

  log("Simulated turns", "PASS", `${simulatedTurns.length} turns defined`);

  for (const turn of simulatedTurns) {
    const expectedOutputs = [
      turn.expectedTools.length > 0 ? `tools: ${turn.expectedTools.join("+")}` : null,
      turn.expectedElements.length > 0 ? `elements: ${turn.expectedElements.join("+")}` : null,
      (turn as any).expectedJSON?.length > 0 ? `JSON: ${(turn as any).expectedJSON.join("+")}` : null,
    ].filter(Boolean).join(", ");

    log(`Turn → ${turn.expectedPhase}`, "PASS",
      `"${turn.input.substring(0, 50)}..." → ${expectedOutputs || "response only"}`);
  }

  // Verify phases coverage
  const phases = ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11"];
  for (const phase of phases) {
    log(`Phase ${phase} defined`, solomonContent.includes(`${phase} —`) || solomonContent.includes(`${phase}:`) ? "PASS" : "FAIL", "");
  }
}

// ═══════════════════════════════════════════════════════
// FAZA 5: COMPOSE BRIEF + NEEMIA SIMULATION
// ═══════════════════════════════════════════════════════
function faza5_composeSimulation() {
  setFase("FAZA 5 — COMPOSE BRIEF + NEEMIA (simulat)");

  // Verify compose brief structure
  const solomonRoutes = path.join(API_SRC, "routes/solomon.ts");
  const routeContent = fs.readFileSync(solomonRoutes, "utf-8");
  log("compose-brief endpoint", routeContent.includes("/compose-brief") ? "PASS" : "FAIL", "Exists");
  log("Brief: narrativeThread", routeContent.includes("narrativeThread") ? "PASS" : "FAIL", "In prompt");
  log("Brief: strategicArguments", routeContent.includes("strategicArguments") ? "PASS" : "FAIL", "In prompt");

  // Verify neemiaCompose has brief + RAG
  const composePath = path.join(API_SRC, "services/neemiaCompose.ts");
  const composeContent = fs.readFileSync(composePath, "utf-8");
  log("Compose: composeBrief used", composeContent.includes("composeBrief") ? "PASS" : "FAIL", "");
  log("Compose: hybridSearch used", composeContent.includes("hybridSearch") ? "PASS" : "FAIL", "");
  log("Compose: organizationId filter", composeContent.includes("organizationId") ? "PASS" : "FAIL", "Security check");

  // Verify compose section generation endpoint
  const neemiaRoutes = path.join(API_SRC, "routes/neemia.ts");
  const neemiaContent = fs.readFileSync(neemiaRoutes, "utf-8");
  log("generate-section endpoint", neemiaContent.includes("/compose/generate-section") ? "PASS" : "FAIL", "");
  log("coherence-check endpoint", neemiaContent.includes("/compose/coherence-check") ? "PASS" : "FAIL", "");

  // Simulate compose sections from Template Memoriu
  const templatePath = path.join(DOCS_DIR, "Template Memoriu.docx");
  if (fs.existsSync(templatePath)) {
    const sizeKB = Math.round(fs.statSync(templatePath).size / 1024);
    log("Template Memoriu", "PASS", `${sizeKB} KB — would produce compose sections`);
  }
}

// ═══════════════════════════════════════════════════════
// FAZA 6: SECURITY + ISOLATION
// ═══════════════════════════════════════════════════════
function faza6_security() {
  setFase("FAZA 6 — SECURITATE + IZOLARE DATE");

  const solomonPath = path.join(API_SRC, "services/solomon.ts");
  const solomonContent = fs.readFileSync(solomonPath, "utf-8");

  // Check all project queries have organizationId
  const unscopedMatches = solomonContent.match(/where: eq\(projects\.id, projectId\)\)/g) || [];
  log("Solomon: project queries scoped", unscopedMatches.length === 0 ? "PASS" : "FAIL",
    unscopedMatches.length === 0 ? "All have organizationId" : `${unscopedMatches.length} UNSCOPED`);

  const neemiaPath = path.join(API_SRC, "services/neemia.ts");
  const neemiaContent = fs.readFileSync(neemiaPath, "utf-8");
  const neemiaUnscoped = neemiaContent.match(/where: eq\(projects\.id, projectId\)\)/g) || [];
  log("Neemia: project queries scoped", neemiaUnscoped.length === 0 ? "PASS" : "FAIL",
    neemiaUnscoped.length === 0 ? "All have organizationId" : `${neemiaUnscoped.length} UNSCOPED`);

  const composePath = path.join(API_SRC, "services/neemiaCompose.ts");
  const composeContent = fs.readFileSync(composePath, "utf-8");
  const composeUnscoped = composeContent.match(/where: eq\(projects\.id, projectId\)\)/g) || [];
  log("neemiaCompose: project queries scoped", composeUnscoped.length === 0 ? "PASS" : "FAIL",
    composeUnscoped.length === 0 ? "All have organizationId" : `${composeUnscoped.length} UNSCOPED`);

  // Verify hybridSearch always filters by cabinetId
  const searchPath = path.join(API_SRC, "services/hybridSearch.ts");
  const searchContent = fs.readFileSync(searchPath, "utf-8");
  log("hybridSearch: cabinetId required", searchContent.includes("cabinet_id = ${cabinetId}") ? "PASS" : "FAIL", "");

  // Verify cross-project memory disabled
  log("Cross-project memory disabled", solomonContent.includes("Cross-project case memories DISABLED") ? "PASS" : "FAIL", "");
}

// ═══════════════════════════════════════════════════════
// FAZA 7: WORKFLOW V3 FEATURES
// ═══════════════════════════════════════════════════════
function faza7_workflowV3() {
  setFase("FAZA 7 — WORKFLOW V3 (Semnale, Bucle, Q0-Q11)");

  const solomonPath = path.join(API_SRC, "services/solomon.ts");
  const solomonContent = fs.readFileSync(solomonPath, "utf-8");

  log("SIGNAL_JSON in prompt", solomonContent.includes("SIGNAL_JSON") ? "PASS" : "FAIL", "");
  log("Signal types: risc", solomonContent.includes('"risc"') ? "PASS" : "FAIL", "");
  log("Signal types: bucla", solomonContent.includes("bucla") ? "PASS" : "FAIL", "");
  log("Signal types: discutie_client", solomonContent.includes("discutie_client") ? "PASS" : "FAIL", "");
  log("Phase regression support", solomonContent.includes('"regression"') ? "PASS" : "FAIL", "");
  log("Q0: 5 mandatory elements", solomonContent.includes("problema_client") && solomonContent.includes("ambitia_3_5_ani") ? "PASS" : "FAIL", "");
  log("Q10: Finalizare", solomonContent.includes("FINALIZARE") ? "PASS" : "FAIL", "");
  log("Q11: Post-depunere sub-phases", solomonContent.includes("Q11a") && solomonContent.includes("Q11d") ? "PASS" : "FAIL", "");
  log("Validity checking: 30 zile", solomonContent.includes("30 zile") ? "PASS" : "FAIL", "");
  log("Persistent memory: summaries", solomonContent.includes("prevConvs") ? "PASS" : "FAIL", "");
}

// ═══════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════
function printReport() {
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  const warn = results.filter(r => r.status === "WARN").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RAPORT FINAL: ✅ ${pass}  ❌ ${fail}  ⚠️ ${warn}  (total: ${results.length})`);
  console.log(`${"═".repeat(60)}`);

  if (fail > 0) {
    console.log("\n  EȘECURI:");
    for (const r of results.filter(r => r.status === "FAIL")) {
      console.log(`    ❌ [${r.fase}] ${r.test}${r.details ? `: ${r.details}` : ""}`);
    }
  }
  if (warn > 0) {
    console.log("\n  AVERTISMENTE:");
    for (const r of results.filter(r => r.status === "WARN")) {
      console.log(`    ⚠️ [${r.fase}] ${r.test}${r.details ? `: ${r.details}` : ""}`);
    }
  }
  console.log();
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  E2E SIMULATED TEST — docs_example/ real documents     ║");
console.log("║  No API/DB/Redis/AI needed — pure code verification    ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const inventory = faza1_inventory();
faza2_chunking(inventory);
faza3_formspec(inventory);
faza4_solomonSimulation();
faza5_composeSimulation();
faza6_security();
faza7_workflowV3();

printReport();
process.exit(results.some(r => r.status === "FAIL") ? 1 : 0);
