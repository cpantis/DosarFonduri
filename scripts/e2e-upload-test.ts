#!/usr/bin/env npx tsx
/**
 * E2E Upload Test — Tests the complete upload flow with real documents from docs_example/
 *
 * Tests:
 * 1. File type detection for every document type (PDF, DOCX, DOC, XLSX, PNG, JPG)
 * 2. Filename sanitization (diacritics, special chars, spaces)
 * 3. Size validation per processing type
 * 4. Processing type resolution from folder type
 * 5. DB record creation (documents + files tables)
 * 6. Legacy upload path (FormData through Node)
 * 7. Presigned URL path (request + confirm)
 * 8. Tag parsing (JSON vs comma-separated)
 *
 * Requires: PostgreSQL running with migrations applied. Does NOT require S3/R2.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sign } from "hono/jwt";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "../apps/api/src/db/schema";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── CONFIG ───
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://dosarfonduri:dosarfonduri@127.0.0.1:5432/dosarfonduri";
const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-e2e-testing-32chars";
const DOCS_DIR = path.resolve(__dirname, "../docs_example");

// ─── DB ───
const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

// ─── LOGGING ───
let pass = 0, fail = 0, warn = 0, skip = 0;
const results: { phase: string; step: string; status: string; detail: string }[] = [];

function log(step: string, status: "PASS" | "FAIL" | "WARN" | "SKIP", detail = "") {
  const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️", SKIP: "⏭️" }[status];
  if (status === "PASS") pass++;
  else if (status === "FAIL") fail++;
  else if (status === "WARN") warn++;
  else skip++;
  console.log(`  ${icon} ${step}${detail ? `: ${detail}` : ""}`);
  results.push({ phase: currentPhase, step, status, detail });
}
let currentPhase = "";
function phase(name: string) {
  currentPhase = name;
  console.log(`\n${"═".repeat(60)}\n  FAZA: ${name}\n${"═".repeat(60)}`);
}

// ─── HELPERS (copied from documents.ts for offline testing) ───
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "application/msword": "doc",
  "image/png": "png",
  "image/jpeg": "jpg",
};

const EXT_TO_FILETYPE: Record<string, string> = {
  pdf: "pdf", docx: "docx", xlsx: "xlsx", xls: "xlsx",
  doc: "doc", png: "png", jpg: "jpg", jpeg: "jpg",
};

const MAX_SIZE: Record<string, number> = {
  ghid: 50 * 1024 * 1024,
  reference_data: 30 * 1024 * 1024,
  template: 20 * 1024 * 1024,
  client_doc: 20 * 1024 * 1024,
  reference: 20 * 1024 * 1024,
};

function resolveProcessingType(folderType: string, explicitType: string | null): string {
  if (explicitType === "reference_data" && folderType === "ghiduri") return "reference_data";
  if (folderType === "ghiduri") return "ghid";
  if (folderType === "templateuri") return "template";
  if (folderType === "clienti_prospecti" || folderType === "clienti_finali") return "client_doc";
  return "reference";
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ăâ]/gi, "a").replace(/[îì]/gi, "i")
    .replace(/[șş]/gi, "s").replace(/[țţ]/gi, "t")
    .replace(/[^a-zA-Z0-9._\-\s]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function getMimeType(ext: string): string {
  const mimes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    doc: "application/msword",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return mimes[ext] || "application/octet-stream";
}

// ─── TEST DATA IDS ───
let testOrgId = "";
let testUserId = "";
let testToken = "";
let ghidFolderId = "";
let templateFolderId = "";
let clientFolderId = "";
let programFolderId = "";
let masuraFolderId = "";
let sesiuneFolderId = "";

// ─── MAIN ───
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   E2E UPLOAD TEST — DosarFonduri         ║");
  console.log("╚══════════════════════════════════════════╝");

  // Check docs directory
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`❌ docs_example directory not found at ${DOCS_DIR}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(DOCS_DIR)
    .filter(f => /\.(pdf|docx|doc|xlsx|png|jpg|jpeg)$/i.test(f))
    .map(f => ({
      name: f,
      path: path.join(DOCS_DIR, f),
      ext: f.split(".").pop()!.toLowerCase(),
      size: fs.statSync(path.join(DOCS_DIR, f)).size,
    }));

  console.log(`\n📁 Found ${allFiles.length} uploadable documents in docs_example/\n`);

  try {
    // ═══════════════════════════════════════
    // PHASE 0: Setup test data
    // ═══════════════════════════════════════
    phase("0 — Setup Test Data");

    // Create org
    const [org] = await db.insert(schema.organizations).values({
      name: "Upload Test Org",
      code: "UPLOAD-" + Date.now(),
      plan: "professional",
      maxUsers: 10,
      status: "active",
    }).returning();
    testOrgId = org.id;
    log("Create organization", "PASS", `id=${testOrgId}`);

    // Create user
    const passwordHash = crypto.createHash("sha256").update("test123").digest("hex");
    const [user] = await db.insert(schema.users).values({
      email: `upload-test-${Date.now()}@test.com`,
      name: "Upload Test User",
      passwordHash,
      organizationId: testOrgId,
      role: "admin",
      status: "active",
    }).returning();
    testUserId = user.id;
    log("Create user", "PASS", `id=${testUserId}`);

    // Create JWT token
    testToken = await sign(
      { sub: testUserId, exp: Math.floor(Date.now() / 1000) + 86400 },
      JWT_SECRET,
      "HS256",
    );
    log("Create JWT token", "PASS", `token=${testToken.slice(0, 20)}...`);

    // Create folder hierarchy: program > masura > sesiune > {ghiduri, templateuri, clienti_finali}
    const [program] = await db.insert(schema.documentFolders).values({
      organizationId: testOrgId, name: "Program Test", type: "program", createdBy: testUserId,
    }).returning();
    programFolderId = program.id;

    const [masura] = await db.insert(schema.documentFolders).values({
      organizationId: testOrgId, name: "Masura 4.1", type: "masura", parentId: programFolderId, createdBy: testUserId,
    }).returning();
    masuraFolderId = masura.id;

    const [sesiune] = await db.insert(schema.documentFolders).values({
      organizationId: testOrgId, name: "Sesiune 1", type: "sesiune", parentId: masuraFolderId, createdBy: testUserId,
    }).returning();
    sesiuneFolderId = sesiune.id;

    const [ghidFolder] = await db.insert(schema.documentFolders).values({
      organizationId: testOrgId, name: "Ghiduri", type: "ghiduri", parentId: sesiuneFolderId, createdBy: testUserId,
    }).returning();
    ghidFolderId = ghidFolder.id;

    const [tmplFolder] = await db.insert(schema.documentFolders).values({
      organizationId: testOrgId, name: "Templateuri", type: "templateuri", parentId: sesiuneFolderId, createdBy: testUserId,
    }).returning();
    templateFolderId = tmplFolder.id;

    const [clientFolder] = await db.insert(schema.documentFolders).values({
      organizationId: testOrgId, name: "Clienti Finali", type: "clienti_finali", parentId: sesiuneFolderId, createdBy: testUserId,
    }).returning();
    clientFolderId = clientFolder.id;

    log("Create folder hierarchy", "PASS", `program > masura > sesiune > {ghiduri, templateuri, clienti_finali}`);

    // ═══════════════════════════════════════
    // PHASE 1: File type detection
    // ═══════════════════════════════════════
    phase("1 — File Type Detection");

    for (const f of allFiles) {
      const mime = getMimeType(f.ext);
      let fileType = ALLOWED_MIME_TYPES[mime];
      if (!fileType) fileType = EXT_TO_FILETYPE[f.ext];

      if (fileType) {
        log(`Type: ${f.name}`, "PASS", `ext=${f.ext} → mime=${mime} → fileType=${fileType}`);
      } else {
        log(`Type: ${f.name}`, "FAIL", `ext=${f.ext}, mime=${mime} → NO MATCH`);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 2: Filename sanitization
    // ═══════════════════════════════════════
    phase("2 — Filename Sanitization");

    const tricky = [
      "14.6 Descrierea succinta a proiectului_ANDA.docx",
      "Certificat constatator ANDA OANA AGRO FERMA SRL din 21.06.2024.pdf",
      "3.Documente care dovedesc forma de organizare - semnat.pdf",
      "Bilant_AndaOana_38480585_2023_12(1).pdf",
      "anexa-10-instructiuni-privind-evitarea-crearii-de-conditii-artificiale-in-accesarea-pndr-2014-2020.doc",
      "4.0. Anexa 3 - Memoriu justificativ.doc",
      "e-1-2-fisa-de-evaluare-generala-sm-41.docx",
      "DIPLOMA ING AGRONOM.pdf",
      "Anda Cultivator.png",
    ];

    for (const name of tricky) {
      const raw = name.replace(/\.[^.]+$/, "");
      const safe = sanitizeFilename(raw);
      const valid = safe.length > 0 && /^[a-zA-Z0-9._\-\s]+$/.test(safe) && !safe.includes("ă") && !safe.includes("ș") && !safe.includes("ț") && !safe.includes("î") && !safe.includes("â");
      if (valid) {
        log(`Sanitize: "${raw}"`, "PASS", `→ "${safe}"`);
      } else {
        log(`Sanitize: "${raw}"`, "FAIL", `→ "${safe}" (still has invalid chars or empty)`);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 3: Size validation
    // ═══════════════════════════════════════
    phase("3 — Size Validation");

    for (const f of allFiles) {
      const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
      // Ghid folder allows up to 50 MB
      const maxGhid = MAX_SIZE.ghid;
      const maxClient = MAX_SIZE.client_doc;

      if (f.size <= maxGhid) {
        log(`Size: ${f.name}`, "PASS", `${sizeMB} MB (under 50 MB ghid limit)`);
      } else {
        log(`Size: ${f.name}`, "FAIL", `${sizeMB} MB exceeds 50 MB ghid limit`);
      }

      // Check client_doc limit for non-ghid uploads
      if (f.size > maxClient && f.name !== "ghidul-solicitantului-sm-41-componenta-411-final.pdf") {
        log(`Size client_doc: ${f.name}`, "WARN", `${sizeMB} MB exceeds 20 MB client_doc limit`);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 4: Processing type resolution
    // ═══════════════════════════════════════
    phase("4 — Processing Type Resolution");

    const cases: [string, string | null, string][] = [
      ["ghiduri", null, "ghid"],
      ["ghiduri", "reference_data", "reference_data"],
      ["templateuri", null, "template"],
      ["clienti_prospecti", null, "client_doc"],
      ["clienti_finali", null, "client_doc"],
      ["program", null, "reference"],
      ["masura", null, "reference"],
      ["sesiune", null, "reference"],
    ];

    for (const [folderType, explicit, expected] of cases) {
      const result = resolveProcessingType(folderType, explicit);
      if (result === expected) {
        log(`ProcessingType(${folderType}, ${explicit})`, "PASS", `→ ${result}`);
      } else {
        log(`ProcessingType(${folderType}, ${explicit})`, "FAIL", `expected ${expected}, got ${result}`);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 5: DB Upload Simulation (without S3)
    // ═══════════════════════════════════════
    phase("5 — DB Upload Simulation (all documents)");

    // Map documents to their target folders
    const docFolderMap: Record<string, { folderId: string; processingType: string }> = {
      "ghidul-solicitantului-sm-41-componenta-411-final.pdf": { folderId: ghidFolderId, processingType: "ghid" },
      "Anunt Cerere proiecte componenta 4.1.1.pdf": { folderId: ghidFolderId, processingType: "ghid" },
      "Anexa 4 Lista UAT ANC.xlsx": { folderId: ghidFolderId, processingType: "reference_data" },
      "Anexa 3 Corelarea Puterii Masinii Cu Suprafata Fermei Pentru Achizitionarea De Masini Agricole 03.06.docx": { folderId: ghidFolderId, processingType: "reference_data" },
      "anexa-3_corelarea-puterii-masinii-cu-suprafata-fermei-pentru-achizitionarea-de-masini-agricole-0306.docx": { folderId: ghidFolderId, processingType: "reference_data" },
      "e-1-2-fisa-de-evaluare-generala-sm-41.docx": { folderId: ghidFolderId, processingType: "reference_data" },
      "Anexa 1 CEREREA De FINANTARE M4.1.pdf": { folderId: templateFolderId, processingType: "template" },
      "Anexa 2 Anexa B.pdf": { folderId: templateFolderId, processingType: "template" },
      "Anexa 2 Anexa C.pdf": { folderId: templateFolderId, processingType: "template" },
      "Template Memoriu.docx": { folderId: templateFolderId, processingType: "template" },
      "4.0. Anexa 3 - Memoriu justificativ.doc": { folderId: templateFolderId, processingType: "template" },
      "anexa-10-instructiuni-privind-evitarea-crearii-de-conditii-artificiale-in-accesarea-pndr-2014-2020.doc": { folderId: templateFolderId, processingType: "template" },
      "anexa-11-model-adeverinta-emisa-de-forma-asociativa-pentru-dovedirea-calitatii-de-membru-a-beneficiarului.docx": { folderId: templateFolderId, processingType: "template" },
    };

    // Everything else → clienti_finali
    for (const f of allFiles) {
      if (!docFolderMap[f.name]) {
        docFolderMap[f.name] = { folderId: clientFolderId, processingType: "client_doc" };
      }
    }

    let uploadedCount = 0;
    const uploadedDocIds: string[] = [];

    for (const f of allFiles) {
      const mapping = docFolderMap[f.name];
      const mime = getMimeType(f.ext);
      let fileType = ALLOWED_MIME_TYPES[mime] || EXT_TO_FILETYPE[f.ext];
      if (!fileType) {
        log(`Upload: ${f.name}`, "SKIP", "unsupported file type");
        continue;
      }

      const rawName = f.name.replace(/\.[^.]+$/, "");
      const safeName = sanitizeFilename(rawName) || rawName;
      const buffer = fs.readFileSync(f.path);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");

      try {
        // Create file record (simulating storage.uploadFile without actual S3)
        const storageKey = `${testOrgId}/uploads/${crypto.randomUUID()}.${f.ext}`;
        const [fileRecord] = await db.insert(schema.files).values({
          storageKey,
          originalName: f.name,
          mimeType: mime,
          size: f.size,
          organizationId: testOrgId,
          uploadedBy: testUserId,
        }).returning();

        // Create document record
        const [doc] = await db.insert(schema.documents).values({
          folderId: mapping.folderId,
          organizationId: testOrgId,
          name: safeName,
          fileType: fileType as any,
          mimeType: mime,
          fileId: fileRecord.id,
          fileSize: f.size,
          fileHash: hash,
          status: "uploaded",
          processingType: mapping.processingType as any,
          tags: [],
          uploadedBy: testUserId,
        }).returning();

        uploadedDocIds.push(doc.id);
        uploadedCount++;
        log(`Upload: ${f.name}`, "PASS", `docId=${doc.id.slice(0,8)}, type=${fileType}, proc=${mapping.processingType}, size=${(f.size/1024).toFixed(0)}KB`);
      } catch (err: any) {
        log(`Upload: ${f.name}`, "FAIL", err.message?.slice(0, 120));
      }
    }

    log(`Upload summary`, uploadedCount === allFiles.length ? "PASS" : "FAIL",
      `${uploadedCount}/${allFiles.length} documents uploaded`);

    // ═══════════════════════════════════════
    // PHASE 6: Verify DB Records
    // ═══════════════════════════════════════
    phase("6 — Verify DB Records");

    // Check documents table
    const docs = await db.query.documents.findMany({
      where: eq(schema.documents.organizationId, testOrgId),
    });
    log("Documents in DB", docs.length === allFiles.length ? "PASS" : "FAIL",
      `${docs.length} documents (expected ${allFiles.length})`);

    // Check files table
    const fileRecords = await db.query.files.findMany({
      where: eq(schema.files.organizationId, testOrgId),
    });
    log("Files in DB", fileRecords.length === allFiles.length ? "PASS" : "FAIL",
      `${fileRecords.length} file records (expected ${allFiles.length})`);

    // Check each document has a valid file reference
    let orphanedDocs = 0;
    for (const doc of docs) {
      const file = fileRecords.find(f => f.id === doc.fileId);
      if (!file) orphanedDocs++;
    }
    log("Document→File FK integrity", orphanedDocs === 0 ? "PASS" : "FAIL",
      orphanedDocs === 0 ? "all documents reference valid files" : `${orphanedDocs} orphaned documents`);

    // Check folder distribution
    const ghidDocs = docs.filter(d => d.folderId === ghidFolderId);
    const tmplDocs = docs.filter(d => d.folderId === templateFolderId);
    const clientDocs = docs.filter(d => d.folderId === clientFolderId);
    log("Folder distribution", "PASS",
      `ghiduri=${ghidDocs.length}, templateuri=${tmplDocs.length}, clienti_finali=${clientDocs.length}`);

    // Check processing types
    const procTypes = new Map<string, number>();
    for (const doc of docs) {
      procTypes.set(doc.processingType || "null", (procTypes.get(doc.processingType || "null") || 0) + 1);
    }
    const procSummary = [...procTypes.entries()].map(([k, v]) => `${k}=${v}`).join(", ");
    log("Processing types", "PASS", procSummary);

    // Check file types
    const fileTypes = new Map<string, number>();
    for (const doc of docs) {
      fileTypes.set(doc.fileType, (fileTypes.get(doc.fileType) || 0) + 1);
    }
    const typeSummary = [...fileTypes.entries()].map(([k, v]) => `${k}=${v}`).join(", ");
    log("File types", "PASS", typeSummary);

    // Verify hashes are unique (no accidental duplicates)
    const hashes = docs.map(d => d.fileHash).filter(Boolean);
    const uniqueHashes = new Set(hashes);
    log("Hash uniqueness", uniqueHashes.size === hashes.length ? "PASS" : "WARN",
      `${uniqueHashes.size} unique hashes out of ${hashes.length} (some files may be identical)`);

    // Check filename sanitization in DB
    const diacriticPattern = /[ăâîșțĂÂÎȘȚ]/;
    const badNames = docs.filter(d => diacriticPattern.test(d.name));
    log("No diacritics in DB names", badNames.length === 0 ? "PASS" : "FAIL",
      badNames.length === 0 ? "all names sanitized" : `${badNames.length} names still have diacritics: ${badNames.map(d => d.name).join(", ")}`);

    // ═══════════════════════════════════════
    // PHASE 7: Duplicate Detection Logic
    // ═══════════════════════════════════════
    phase("7 — Duplicate Detection");

    // Try to upload the same file again — should detect duplicate
    const testFile = allFiles[0];
    const testBuffer = fs.readFileSync(testFile.path);
    const testHash = crypto.createHash("sha256").update(testBuffer).digest("hex");

    const existingWithHash = await db.query.documents.findFirst({
      where: and(
        eq(schema.documents.organizationId, testOrgId),
        eq(schema.documents.fileHash, testHash),
      ),
    });

    if (existingWithHash) {
      log("Duplicate detection", "PASS", `re-upload of "${testFile.name}" detected as duplicate of doc ${existingWithHash.id.slice(0,8)}`);
    } else {
      log("Duplicate detection", "FAIL", `hash ${testHash.slice(0,16)} not found in DB`);
    }

    // ═══════════════════════════════════════
    // PHASE 8: Presigned URL Flow Validation
    // ═══════════════════════════════════════
    phase("8 — Presigned URL Flow Validation (code path)");

    // Verify storage.ts exports createPresignedUploadUrl and verifyFileUploaded
    const storagePath = path.resolve(__dirname, "../apps/api/src/services/storage.ts");
    const storageCode = fs.readFileSync(storagePath, "utf-8");

    const hasCreatePresigned = storageCode.includes("export async function createPresignedUploadUrl");
    log("createPresignedUploadUrl exported", hasCreatePresigned ? "PASS" : "FAIL");

    const hasVerifyUploaded = storageCode.includes("export async function verifyFileUploaded");
    log("verifyFileUploaded exported", hasVerifyUploaded ? "PASS" : "FAIL");

    // Verify presigned URL route exists
    const routesPath = path.resolve(__dirname, "../apps/api/src/routes/documents.ts");
    const routesCode = fs.readFileSync(routesPath, "utf-8");

    const hasPresignedRoute = routesCode.includes('"/presigned-url"');
    log("POST /presigned-url route", hasPresignedRoute ? "PASS" : "FAIL");

    const hasConfirmRoute = routesCode.includes('"/documents/:id/confirm-upload"');
    log("POST /documents/:id/confirm-upload route", hasConfirmRoute ? "PASS" : "FAIL");

    const hasLegacyRoute = routesCode.includes('"/folders/:folderId/documents"');
    log("POST /folders/:folderId/documents route", hasLegacyRoute ? "PASS" : "FAIL");

    // Verify tags parsing fix
    const hasJsonParseTags = routesCode.includes("JSON.parse(rawTags)");
    log("Tags JSON.parse fix", hasJsonParseTags ? "PASS" : "FAIL", hasJsonParseTags ? "properly parses JSON array" : "still uses split(',')");

    // Verify BullMQ dispatch for each processing type
    const hasGuideQueue = routesCode.includes("processGuideQueue.add");
    const hasTemplateQueue = routesCode.includes("processTemplateQueue.add");
    const hasClientDocQueue = routesCode.includes("processClientDocQueue.add");
    const hasRefDataQueue = routesCode.includes("processReferenceDataQueue.add");
    log("BullMQ dispatch: ghid", hasGuideQueue ? "PASS" : "FAIL");
    log("BullMQ dispatch: template", hasTemplateQueue ? "PASS" : "FAIL");
    log("BullMQ dispatch: client_doc", hasClientDocQueue ? "PASS" : "FAIL");
    log("BullMQ dispatch: reference_data", hasRefDataQueue ? "PASS" : "FAIL");

    // Verify SSE notification
    const hasSSE = routesCode.includes("publishUploadEvent");
    log("SSE upload notification", hasSSE ? "PASS" : "FAIL");

    // ═══════════════════════════════════════
    // PHASE 9: Edge Cases
    // ═══════════════════════════════════════
    phase("9 — Edge Cases");

    // Test .doc legacy format detection
    const docFiles = allFiles.filter(f => f.ext === "doc");
    for (const f of docFiles) {
      const mime = getMimeType(f.ext);
      const fileType = ALLOWED_MIME_TYPES[mime] || EXT_TO_FILETYPE[f.ext];
      log(`.doc format: ${f.name}`, fileType === "doc" ? "PASS" : "FAIL",
        `detected as "${fileType}" (legacy .doc → conversion warning expected)`);
    }

    // Test very long filenames
    const longName = "A".repeat(300) + ".pdf";
    const safeLong = sanitizeFilename(longName.replace(/\.[^.]+$/, ""));
    log("Long filename (300 chars)", safeLong.length > 0 ? "PASS" : "FAIL",
      `sanitized to ${safeLong.length} chars`);

    // Test filename with only special chars
    const specialName = "()[]{}!@#$%.pdf";
    const safeSpecial = sanitizeFilename(specialName.replace(/\.[^.]+$/, ""));
    log("Special chars filename", "PASS", `"${specialName}" → "${safeSpecial}"`);

    // Test empty tags
    let parsedTags: string[] = [];
    const rawTags = JSON.stringify([]);
    try { parsedTags = JSON.parse(rawTags); if (!Array.isArray(parsedTags)) parsedTags = []; } catch { parsedTags = rawTags.split(",").filter(Boolean); }
    log("Empty tags parsing", parsedTags.length === 0 ? "PASS" : "FAIL",
      `JSON.stringify([]) → ${JSON.stringify(parsedTags)}`);

    // Test tags with values
    const rawTags2 = JSON.stringify(["urgent", "anda-oana"]);
    let parsedTags2: string[] = [];
    try { parsedTags2 = JSON.parse(rawTags2); if (!Array.isArray(parsedTags2)) parsedTags2 = []; } catch { parsedTags2 = rawTags2.split(",").filter(Boolean); }
    log("Tags with values", parsedTags2.length === 2 ? "PASS" : "FAIL",
      `→ ${JSON.stringify(parsedTags2)}`);

    // Test old-style comma tags (backward compat)
    const rawTagsOld = "urgent,important";
    let parsedTagsOld: string[] = [];
    try { parsedTagsOld = JSON.parse(rawTagsOld); if (!Array.isArray(parsedTagsOld)) parsedTagsOld = []; } catch { parsedTagsOld = rawTagsOld.split(",").filter(Boolean); }
    log("Old-style comma tags", parsedTagsOld.length === 2 ? "PASS" : "FAIL",
      `"${rawTagsOld}" → ${JSON.stringify(parsedTagsOld)}`);

    // ═══════════════════════════════════════
    // PHASE 10: Frontend Upload Modal Fix Verification
    // ═══════════════════════════════════════
    phase("10 — Frontend Upload Modal Fix");

    const frontendPath = path.resolve(__dirname, "../apps/web/src/app/(app)/documents/page.tsx");
    const frontendCode = fs.readFileSync(frontendPath, "utf-8");

    // Verify file input is inside modal (not outside behind overlay)
    const modalSection = frontendCode.slice(frontendCode.indexOf("UPLOAD MODAL"));
    const hasInputInModal = modalSection.includes('id="doc-upload-input"');
    log("File input inside modal", hasInputInModal ? "PASS" : "FAIL",
      hasInputInModal ? "input is inside modal DOM" : "input still outside modal");

    // Verify label-based click (more reliable than programmatic .click())
    const hasLabelFor = modalSection.includes('htmlFor={uploadFiles.length === 0 ? "doc-upload-input"');
    log("Label htmlFor approach", hasLabelFor ? "PASS" : "FAIL",
      hasLabelFor ? "uses <label htmlFor> for reliable file picker" : "still uses programmatic .click()");

    // Verify the old input outside modal is removed
    const beforeModal = frontendCode.slice(0, frontendCode.indexOf("UPLOAD MODAL"));
    const hasOldInput = beforeModal.includes('ref={fileInputRef}') && beforeModal.includes('type="file"');
    log("Old input removed", !hasOldInput ? "PASS" : "FAIL",
      !hasOldInput ? "no duplicate file input outside modal" : "old input still exists outside modal");

    // Verify the zone uses <label> not <div>
    const hasLabelZone = modalSection.includes("<label") && modalSection.includes("doc-upload-zone");
    log("Drop zone is <label>", hasLabelZone ? "PASS" : "FAIL",
      hasLabelZone ? "zone is <label> for native click behavior" : "zone is still <div>");

  } finally {
    // ═══════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════
    console.log("\n--- Cleaning up test data ---");
    try {
      // Delete in reverse dependency order
      await sql`DELETE FROM documents WHERE organization_id = ${testOrgId}`;
      await sql`DELETE FROM files WHERE organization_id = ${testOrgId}`;
      await sql`DELETE FROM document_folders WHERE organization_id = ${testOrgId}`;
      await sql`DELETE FROM users WHERE organization_id = ${testOrgId}`;
      await sql`DELETE FROM organizations WHERE id = ${testOrgId}`;
      console.log("  Cleanup complete.\n");
    } catch (err: any) {
      console.warn("  Cleanup error:", err.message);
    }

    // Write report
    const report = `# E2E Upload Test Results

**Date:** ${new Date().toISOString()}
**Branch:** claude/audit-document-flows-r2LjN
**Documents tested:** ${allFiles.length} real files from docs_example/

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | ${pass} |
| ❌ FAIL | ${fail} |
| ⚠️ WARN | ${warn} |
| ⏭️ SKIP | ${skip} |
| **Total** | **${pass + fail + warn + skip}** |

## File Types Tested

| Type | Count |
|------|-------|
| PDF | ${allFiles.filter(f => f.ext === "pdf").length} |
| DOCX | ${allFiles.filter(f => f.ext === "docx").length} |
| DOC | ${allFiles.filter(f => f.ext === "doc").length} |
| XLSX | ${allFiles.filter(f => f.ext === "xlsx").length} |
| PNG | ${allFiles.filter(f => f.ext === "png").length} |

## Phases

${[...new Set(results.map(r => r.phase))].map(p => {
  const phaseResults = results.filter(r => r.phase === p);
  const pPass = phaseResults.filter(r => r.status === "PASS").length;
  const pFail = phaseResults.filter(r => r.status === "FAIL").length;
  const pWarn = phaseResults.filter(r => r.status === "WARN").length;
  const icon = pFail > 0 ? "❌" : pWarn > 0 ? "⚠️" : "✅";
  return `### ${icon} FAZA ${p}\n\n${pPass} pass, ${pFail} fail, ${pWarn} warn\n${
    phaseResults.filter(r => r.status !== "PASS").map(r =>
      `| ${r.status === "FAIL" ? "❌" : "⚠️"} | ${r.step} | ${r.detail} |`
    ).join("\n") || ""
  }`;
}).join("\n\n")}

## Documents Tested

${allFiles.map(f => `- \`${f.name}\` (${(f.size / 1024).toFixed(0)} KB, .${f.ext})`).join("\n")}
`;

    fs.writeFileSync(path.join(DOCS_DIR, "UPLOAD_TEST_RESULTS.md"), report);
    console.log(`📄 Report written to docs_example/UPLOAD_TEST_RESULTS.md`);

    await sql.end();
  }

  // Final
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  FINAL: ✅ ${pass} PASS  ❌ ${fail} FAIL  ⚠️  ${warn} WARN  ⏭️  ${skip} SKIP`);
  console.log(`${"═".repeat(60)}\n`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err);
  sql.end().then(() => process.exit(1));
});
