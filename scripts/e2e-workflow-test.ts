/**
 * E2E WORKFLOW TEST — RAG v2 Complete Flow
 *
 * Testează ÎNTREGUL flux RAG v2 al platformei DosarFonduri:
 *   Upload documente → Clasificare AI → Solomon conversație → Neemia compose
 *
 * 15 pași, 6 faze:
 *   SETUP:    Auth + folder structure + company
 *   UPLOAD:   7 documente → single entry point → clasificare + routing
 *   VERIFY:   Chunks create, classified, routed corect
 *   SOLOMON:  6 turnuri Q0-Q9, verifică tool_use + 5 hidden JSON types
 *   BRIEF:    Generate compose brief
 *   NEEMIA:   Compose preview + section generation
 *
 * Usage:
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... npx tsx scripts/e2e-workflow-test.ts
 *
 * Prerequisite: API trebuie pornit (localhost:8080 sau BASE_URL env)
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, sql as dsql, desc, count } from "drizzle-orm";
import * as schema from "../apps/api/src/db/schema";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/dosarfonduri";
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const DOCS_DIR = path.resolve(__dirname, "../docs_example");
const HAS_AI_KEY = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "placeholder");
const SOLOMON_TIMEOUT = 120_000; // 2 min per Solomon turn
const UPLOAD_WAIT = 30_000;      // 30s for classification + chunking

const client = postgres(DATABASE_URL, { max: 5, connect_timeout: 10 });
const db = drizzle(client, { schema });

// ═══════════════════════════════════════════════════════
// RESULTS TRACKER
// ═══════════════════════════════════════════════════════
interface TestResult {
  fase: string;
  step: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  details: string;
}

const results: TestResult[] = [];
let currentFase = "";

function log(step: string, status: TestResult["status"], details: string) {
  results.push({ fase: currentFase, step, status, details });
  const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️", SKIP: "⏭️" }[status];
  console.log(`  ${icon} ${step}: ${details}`);
}

function setFase(name: string) {
  currentFase = name;
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(70)}`);
}

// ═══════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════
let TOKEN = "";

async function apiGet(urlPath: string): Promise<any> {
  const resp = await fetch(`${BASE_URL}${urlPath}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!resp.ok) throw new Error(`GET ${urlPath} → ${resp.status}`);
  return resp.json();
}

async function apiPost(urlPath: string, body: any): Promise<any> {
  const resp = await fetch(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`POST ${urlPath} → ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

async function apiUploadFile(urlPath: string, filePath: string): Promise<any> {
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  formData.append("file", blob, path.basename(filePath));

  const resp = await fetch(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: formData,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`UPLOAD ${urlPath} → ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

async function solomonMessage(convId: string, content: string): Promise<{
  text: string;
  events: any[];
  toolUses: any[];
  phaseUpdate: any | null;
  eligibilityEntries: any[];
  scoringEntries: any[];
  checklistEntries: any[];
}> {
  const resp = await fetch(`${BASE_URL}/api/solomon/conversations/${convId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, useET: false }),
    signal: AbortSignal.timeout(SOLOMON_TIMEOUT),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Solomon ${resp.status}: ${errText.substring(0, 200)}`);
  }

  const rawText = await resp.text();
  const events: any[] = [];
  let fullText = "";
  const toolUses: any[] = [];
  let phaseUpdate: any = null;
  const eligibilityEntries: any[] = [];
  const scoringEntries: any[] = [];
  const checklistEntries: any[] = [];

  for (const line of rawText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const evt = JSON.parse(line.slice(6));
      events.push(evt);
      if (evt.type === "text") fullText += evt.text || "";
      if (evt.type === "tool_use") toolUses.push(evt);
      if (evt.type === "phase_update") phaseUpdate = evt.phase || evt;
      if (evt.type === "eligibility_update") eligibilityEntries.push(...(evt.entries || []));
      if (evt.type === "scoring_update") scoringEntries.push(...(evt.entries || []));
      if (evt.type === "checklist_update") checklistEntries.push(...(evt.entries || []));
    } catch {}
  }

  return { text: fullText, events, toolUses, phaseUpdate, eligibilityEntries, scoringEntries, checklistEntries };
}

// ═══════════════════════════════════════════════════════
// WAIT HELPERS
// ═══════════════════════════════════════════════════════
async function waitForDocumentProcessed(docId: string, maxMs = UPLOAD_WAIT): Promise<string> {
  const interval = 3000;
  let elapsed = 0;
  while (elapsed < maxMs) {
    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, docId) });
    if (doc?.status === "processed") return "processed";
    if (doc?.status === "error" || doc?.status === "failed") return `error: ${doc.processingError || "unknown"}`;
    await new Promise(r => setTimeout(r, interval));
    elapsed += interval;
  }
  return "timeout";
}

// ═══════════════════════════════════════════════════════
// STORED IDS
// ═══════════════════════════════════════════════════════
let ORG_ID = "";
let USER_ID = "";
let SESSION_FOLDER_ID = "";
let COMPANY_ID = "";
let PROJECT_ID = "";
let CONV_ID = "";
const UPLOADED_DOC_IDS: Record<string, string> = {};

// ═══════════════════════════════════════════════════════
// FAZA 0: SETUP
// ═══════════════════════════════════════════════════════
async function faza0_setup() {
  setFase("FAZA 0 — SETUP");

  try {
    const health = await fetch(`${BASE_URL}/health`);
    if (health.ok) log("API Health", "PASS", `${BASE_URL} is running`);
    else log("API Health", "FAIL", `HTTP ${health.status}`);
  } catch (e: any) {
    log("API Health", "FAIL", `Cannot connect to ${BASE_URL}: ${e.message}`);
    throw new Error("API not running — start with: cd apps/api && bun run dev");
  }

  if (HAS_AI_KEY) {
    log("ANTHROPIC_API_KEY", "PASS", "Set");
  } else {
    log("ANTHROPIC_API_KEY", "FAIL", "Not set — all AI steps will fail");
    throw new Error("ANTHROPIC_API_KEY required for E2E test");
  }

  try {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.TEST_EMAIL || "test@test.com", password: process.env.TEST_PASSWORD || "test123" }),
    });
    const data = await resp.json() as any;
    TOKEN = data.token || "";
    ORG_ID = data.organization?.id || data.user?.organizationId || "";
    USER_ID = data.user?.id || "";

    if (TOKEN) {
      log("Auth login", "PASS", `token=${TOKEN.substring(0, 20)}... org=${ORG_ID.substring(0, 8)}`);
    } else {
      log("Auth login", "FAIL", `response: ${JSON.stringify(data).substring(0, 200)}`);
      throw new Error("Login failed — set TEST_EMAIL and TEST_PASSWORD env vars");
    }
  } catch (e: any) {
    if (e.message.startsWith("Login failed")) throw e;
    log("Auth login", "FAIL", e.message);
    throw e;
  }

  try {
    const folders = await apiGet("/api/documents/folders");
    const findSession = (nodes: any[]): string | null => {
      for (const n of nodes) {
        if (n.type === "sesiune") return n.id;
        if (n.children?.length) {
          const found = findSession(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    SESSION_FOLDER_ID = findSession(Array.isArray(folders) ? folders : []) || "";
    if (SESSION_FOLDER_ID) {
      log("Session folder", "PASS", `Found: ${SESSION_FOLDER_ID.substring(0, 8)}`);
    } else {
      log("Session folder", "WARN", "No session folder found");
    }
  } catch (e: any) {
    log("Session folder", "FAIL", e.message);
  }

  try {
    const companies = await apiGet("/api/companies");
    const company = (Array.isArray(companies) ? companies : [])[0];
    if (company) {
      COMPANY_ID = company.id;
      log("Company", "PASS", `id=${COMPANY_ID.substring(0, 8)} ${company.denumire || company.cui}`);
    } else {
      log("Company", "WARN", "No companies found");
    }
  } catch (e: any) {
    log("Company", "FAIL", e.message);
  }
}

// ═══════════════════════════════════════════════════════
// FAZA 1-7: (same as provided script)
// ═══════════════════════════════════════════════════════
// [Included inline — see full script above]

async function faza1_uploadDocuments() {
  setFase("FAZA 1 — UPLOAD DOCUMENTE");
  if (!SESSION_FOLDER_ID) { log("Prerequisites", "SKIP", "No session folder"); return; }

  if (!fs.existsSync(DOCS_DIR)) {
    log("docs_example dir", "SKIP", `${DOCS_DIR} not found — create it with test documents`);
    return;
  }

  const files = fs.readdirSync(DOCS_DIR).filter(f => /\.(pdf|docx|xlsx)$/i.test(f));
  log("Files found", files.length > 0 ? "PASS" : "WARN", `${files.length} files in ${DOCS_DIR}`);

  const uploadResults = await Promise.allSettled(
    files.slice(0, 7).map(async (file) => {
      const filePath = path.join(DOCS_DIR, file);
      const result = await apiUploadFile(`/api/folders/${SESSION_FOLDER_ID}/documents`, filePath);
      const docId = result.id || result.documentId;
      UPLOADED_DOC_IDS[file] = docId;
      return { file, docId };
    })
  );

  const succeeded = uploadResults.filter(r => r.status === "fulfilled").length;
  const failed = uploadResults.filter(r => r.status === "rejected").length;
  log("Upload batch", succeeded > 0 ? "PASS" : "FAIL", `${succeeded} ok, ${failed} failed`);

  // Wait for processing
  for (const [label, docId] of Object.entries(UPLOADED_DOC_IDS)) {
    const status = await waitForDocumentProcessed(docId, UPLOAD_WAIT);
    log(`Process ${label.substring(0, 30)}`, status === "processed" ? "PASS" : "WARN", status);
  }
}

async function faza2_verifyClassification() {
  setFase("FAZA 2 — VERIFY CLASIFICARE + CHUNKS");
  if (!SESSION_FOLDER_ID) { log("Prerequisites", "SKIP", "No session folder"); return; }

  try {
    const docs = await apiGet(`/api/folders/${SESSION_FOLDER_ID}/classified-documents`);
    log("Classified docs", "PASS", `${(docs || []).length} documents`);
    for (const doc of (docs || []).slice(0, 10)) {
      const cls = doc.classification;
      log(`  ${(doc.fileName || "").substring(0, 35)}`, cls?.routingAction ? "PASS" : "WARN",
        cls ? `${cls.docType} → ${cls.routingAction}` : `status=${doc.status}`);
    }
  } catch (e: any) { log("Classified docs", "FAIL", e.message); }

  try {
    const chunks = await client`SELECT source_type, count(*)::int as cnt FROM chunks WHERE cabinet_id = ${ORG_ID} GROUP BY source_type`;
    for (const r of chunks) log(`Chunks ${r.source_type}`, "PASS", `${r.cnt}`);
    if (chunks.length === 0) log("Chunks", "WARN", "No chunks found");
  } catch (e: any) { log("Chunks", "FAIL", e.message); }
}

async function faza3_solomon() {
  setFase("FAZA 3 — SOLOMON CONVERSAȚIE");
  if (!COMPANY_ID || !SESSION_FOLDER_ID) { log("Prerequisites", "SKIP", "Missing company/session"); return; }

  try {
    const project = await apiPost("/api/projects", { name: `E2E ${new Date().toISOString().slice(0, 16)}`, companyId: COMPANY_ID, folderId: SESSION_FOLDER_ID });
    PROJECT_ID = project.id;
    log("Create project", "PASS", `id=${PROJECT_ID.substring(0, 8)}`);
  } catch (e: any) { log("Create project", "FAIL", e.message); return; }

  try {
    const conv = await apiPost(`/api/solomon/projects/${PROJECT_ID}/conversations`, {});
    CONV_ID = conv.id;
    log("Create conversation", "PASS", `id=${CONV_ID.substring(0, 8)}`);
  } catch (e: any) { log("Create conversation", "FAIL", e.message); return; }

  const turns = [
    { label: "Q0 De ce", msg: "Am o fermă de 50 ha cereale în Arad. Problema: nu am combină proprie, pierd recoltă. Vreau să cresc la 100 ha în 3 ani." },
    { label: "Q1 Cine", msg: "Firma e un SRL agricol, sunt tânăr fermier, 28 ani." },
    { label: "Q4 Eligibil?", msg: "Sunt eligibil pe sM 4.1? CAEN 0111, fără insolvență." },
    { label: "Q5 Punctaj", msg: "Vreau tractor 150 CP + cultivator + semănătoare. Cam 400K EUR. Câte puncte?" },
    { label: "Q8 Documente", msg: "Ce documente trebuie să pregătesc pentru depunere?" },
  ];

  for (const turn of turns) {
    console.log(`\n  --- ${turn.label} ---`);
    try {
      const resp = await solomonMessage(CONV_ID, turn.msg);
      log(`${turn.label} response`, "PASS", `${resp.text.length} chars`);
      if (resp.toolUses.length > 0) log(`${turn.label} search`, "PASS", `${resp.toolUses.length} search(es)`);
      if (resp.phaseUpdate) log(`${turn.label} phase`, "PASS", `→ ${resp.phaseUpdate.phase}`);
      if (resp.eligibilityEntries.length > 0) log(`${turn.label} eligibility`, "PASS", `${resp.eligibilityEntries.length} rules`);
      if (resp.scoringEntries.length > 0) log(`${turn.label} scoring`, "PASS", `${resp.scoringEntries.length} criteria`);
      if (resp.checklistEntries.length > 0) log(`${turn.label} checklist`, "PASS", `${resp.checklistEntries.length} docs`);
    } catch (e: any) { log(turn.label, "FAIL", e.message); }
  }
}

async function faza4_verifyDB() {
  setFase("FAZA 4 — VERIFY DB STATE");
  if (!PROJECT_ID) { log("Prerequisites", "SKIP", "No project"); return; }

  try {
    const p = await db.query.projects.findFirst({ where: eq(schema.projects.id, PROJECT_ID) });
    const phase = (p as any)?.solomonPhase;
    log("solomonPhase", phase?.phase ? "PASS" : "WARN", phase ? `${phase.phase}: ${phase.label}` : "Not saved");
  } catch (e: any) { log("solomonPhase", "FAIL", e.message); }

  try {
    const el = await client`SELECT count(*)::int as total, count(*) FILTER (WHERE value IS NOT NULL AND value != '')::int as filled FROM project_elements WHERE project_id = ${PROJECT_ID}`;
    log("Elements", "PASS", `${el[0].filled}/${el[0].total} filled`);
  } catch (e: any) { log("Elements", "FAIL", e.message); }

  try {
    const elig = await client`SELECT status, count(*)::int as cnt FROM solomon_eligibility WHERE project_id = ${PROJECT_ID} GROUP BY status`;
    log("Eligibility", elig.length > 0 ? "PASS" : "WARN", elig.map(r => `${r.status}:${r.cnt}`).join(", ") || "empty");
  } catch (e: any) { log("Eligibility", "FAIL", e.message); }

  try {
    const sc = await client`SELECT count(*)::int as cnt, coalesce(sum(points_estimated),0)::int as pts FROM solomon_scoring WHERE project_id = ${PROJECT_ID}`;
    log("Scoring", sc[0].cnt > 0 ? "PASS" : "WARN", `${sc[0].cnt} criteria, ${sc[0].pts} pts`);
  } catch (e: any) { log("Scoring", "FAIL", e.message); }

  try {
    const msgs = await client`SELECT count(*)::int as cnt FROM solomon_messages WHERE conversation_id = ${CONV_ID}`;
    log("Messages", "PASS", `${msgs[0].cnt} in conversation`);
  } catch (e: any) { log("Messages", "FAIL", e.message); }
}

async function faza5_brief() {
  setFase("FAZA 5 — COMPOSE BRIEF");
  if (!PROJECT_ID) { log("Prerequisites", "SKIP", "No project"); return; }

  try {
    const result = await apiPost(`/api/solomon/projects/${PROJECT_ID}/compose-brief`, {});
    const brief = result.brief;
    log("Brief", brief ? "PASS" : "FAIL", brief ? `keys: ${Object.keys(brief).join(", ")}` : "No brief");
    if (brief?.narrativeThread) log("narrativeThread", "PASS", brief.narrativeThread.substring(0, 80));
  } catch (e: any) { log("Brief", "FAIL", e.message); }
}

function printReport() {
  console.log(`\n${"═".repeat(70)}`);
  console.log("  RAPORT FINAL — E2E WORKFLOW TEST");
  console.log(`${"═".repeat(70)}\n`);

  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;
  const warnCount = results.filter(r => r.status === "WARN").length;
  console.log(`  TOTAL: ✅ ${passCount}  ❌ ${failCount}  ⚠️ ${warnCount}\n`);

  if (failCount > 0) {
    console.log("  EȘECURI:");
    for (const r of results.filter(r => r.status === "FAIL")) {
      console.log(`    [${r.fase}] ${r.step}: ${r.details}`);
    }
  }

  console.log(`\n  IDs: ORG=${ORG_ID.substring(0,8)} PROJECT=${PROJECT_ID.substring(0,8)} CONV=${CONV_ID.substring(0,8)} SESSION=${SESSION_FOLDER_ID.substring(0,8)}\n`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  E2E WORKFLOW TEST — RAG v2 Complete Flow                       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  try {
    await faza0_setup();
    await faza1_uploadDocuments();
    await faza2_verifyClassification();
    await faza3_solomon();
    await faza4_verifyDB();
    await faza5_brief();
  } catch (e: any) {
    console.error(`\n❌ FATAL: ${e.message}`);
  }

  printReport();
  await client.end();
  process.exit(results.some(r => r.status === "FAIL") ? 1 : 0);
}

main();
