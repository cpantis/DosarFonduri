import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { createHash } from "crypto";
import { updateDocElementSchema, validatePageSchema, createDocElementSchema } from "@dosarfonduri/shared";
import { db } from "../db";
import { documentFolders, documents, files, templateElements, rules, scoringCriteria, elementDefinitions, templatePlaceholderMapping, users, guideReferenceTables, elementRuleLinks, ruleReferenceLinks, sessionChecklist, projects, projectDocuments, projectElements } from "../db/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { uploadFile, getFileUrl, deleteFile, createPresignedUploadUrl, verifyFileUploaded, isLocalStorage } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processGuideQueue, processTemplateQueue, processReferenceDataQueue, processClientDocQueue, JOB_PRIORITY } from "../lib/queue";
import { publishUploadEvent } from "../lib/sse";
import { isRedisReady } from "../lib/redis";

export const documentRoutes = new Hono<AppEnv>();

// Helper: ensure ALL document columns from migrations 0001-0012 exist (self-healing).
// The initial migration 0000 only created the base columns. If the DB was provisioned
// via /setup-db instead of drizzle migrate, these columns are missing.
let _docColumnsChecked = false;
async function ensureDocumentColumns() {
  if (_docColumnsChecked) return;
  try {
    const stmts = [
      // Enums (safe: DO block swallows "already exists")
      `DO $$ BEGIN CREATE TYPE "generation_mode" AS ENUM('fill','compose'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE TYPE "document_type_class" AS ENUM('guide','guide_annex_table','guide_annex_form','certificat_constatator','bilant_anaf','contract_arenda','oferta_pret','registru_imobilizari','declaratie_expert_contabil','document_mediu','extras_cont','certificat_fiscal','memoriu_template','cerere_finantare_template','anexa_b_template','anexa_c_template','carte_identitate','diploma_studii','act_constitutiv','statut','descriere_proiect','adeverinta','foto_echipament','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      // Columns on documents table (safe: IF NOT EXISTS)
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" varchar(100) NOT NULL DEFAULT 'application/octet-stream'`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64)`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill'`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "compose_config" jsonb`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_type_class" "document_type_class"`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "classification_confidence" decimal(3,2)`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_result" jsonb`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_error" text`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "trust_score" decimal(3,2)`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "completeness_report" jsonb`,
      // Columns on files table
      `ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "size" bigint NOT NULL DEFAULT 0`,
      // Enum values (safe: IF NOT EXISTS)
      `ALTER TYPE "doc_processing_type" ADD VALUE IF NOT EXISTS 'reference_data'`,
    ];
    for (const stmt of stmts) {
      try { await db.execute(sql.raw(stmt)); } catch { /* ignore individual failures */ }
    }
    _docColumnsChecked = true;
    console.log("[ensureDocumentColumns] Schema check complete");
  } catch (e) {
    console.warn("[ensureDocumentColumns] warning:", (e as any).message?.substring(0, 120));
  }
}

// --- FOLDER TREE ---
documentRoutes.get("/folders", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  await ensureDocumentColumns();

  const folders = await db.query.documentFolders.findMany({
    where: eq(documentFolders.organizationId, auth.organizationId),
    orderBy: (f, { asc }) => [asc(f.position)],
  });

  // Build recursive tree
  const buildTree = (parentId: string | null): any[] => {
    return folders
      .filter(f => (parentId === null ? f.parentId === null : f.parentId === parentId))
      .map(f => ({
        ...f,
        children: buildTree(f.id),
      }));
  };

  return c.json(buildTree(null));
});

// --- CREATE FOLDER ---
const folderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["program", "masura", "sesiune", "ghiduri", "templateuri", "clienti_prospecti", "clienti_finali"]),
  parentId: z.string().uuid().nullable(),
});

documentRoutes.post("/folders", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = folderSchema.parse(await c.req.json());

  const siblings = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.organizationId, auth.organizationId!),
      body.parentId ? eq(documentFolders.parentId, body.parentId) : isNull(documentFolders.parentId),
    ),
  });

  const [folder] = await db.insert(documentFolders).values({
    organizationId: auth.organizationId!,
    parentId: body.parentId,
    name: body.name,
    type: body.type,
    position: siblings.length,
    createdBy: auth.userId,
  }).returning();

  return c.json(folder, 201);
});

// --- RENAME FOLDER ---
documentRoutes.put("/folders/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const { name } = await c.req.json();

  const [updated] = await db.update(documentFolders).set({ name }).where(
    and(eq(documentFolders.id, id), eq(documentFolders.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

// --- DELETE FOLDER ---
documentRoutes.delete("/folders/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Delete R2 files for all documents and Neemia outputs in this folder tree
  async function deleteFilesInFolder(folderId: string) {
    const docs = await db.query.documents.findMany({
      where: and(eq(documents.folderId, folderId), eq(documents.organizationId, auth.organizationId!)),
    });
    for (const doc of docs) {
      await deleteFile(doc.fileId).catch((e: any) => console.warn("[documents] folder file cleanup:", e.message));
    }

    // Delete R2 files for Neemia-generated docs of projects in this folder
    const folderProjects = await db.query.projects.findMany({
      where: and(eq(projects.folderId, folderId), eq(projects.organizationId, auth.organizationId!)),
      columns: { id: true },
    });
    for (const proj of folderProjects) {
      const generatedDocs = await db.query.projectDocuments.findMany({
        where: eq(projectDocuments.projectId, proj.id),
        columns: { generatedFileId: true },
      });
      for (const gd of generatedDocs) {
        if (gd.generatedFileId) {
          await deleteFile(gd.generatedFileId).catch((e: any) => console.warn("[documents] neemia file cleanup:", e.message));
        }
      }
    }

    // Recurse into child folders
    const children = await db.query.documentFolders.findMany({
      where: and(eq(documentFolders.parentId, folderId), eq(documentFolders.organizationId, auth.organizationId!)),
    });
    for (const child of children) {
      await deleteFilesInFolder(child.id);
    }
  }

  await deleteFilesInFolder(id);

  // Delete folder (documents cascade via onDelete)
  await db.delete(documentFolders).where(
    and(eq(documentFolders.id, id), eq(documentFolders.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});

// --- LIST DOCUMENTS IN FOLDER ---
documentRoutes.get("/folders/:folderId/documents", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const folderId = c.req.param("folderId");

  const docs = await db.query.documents.findMany({
    where: and(
      eq(documents.folderId, folderId),
      eq(documents.organizationId, auth.organizationId!),
    ),
    orderBy: (d, { desc }) => [desc(d.uploadedAt)],
  });

  // Resolve uploadedBy UUIDs to user names
  const uploaderIds = [...new Set(docs.map(d => d.uploadedBy).filter(Boolean))];
  const uploaderMap = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const uploaders = await db.query.users.findMany({
      where: sql`${users.id} IN ${uploaderIds}`,
      columns: { id: true, name: true },
    });
    for (const u of uploaders) uploaderMap.set(u.id, u.name);
  }

  // Enrich with processing summary counts for processed documents
  const enriched = await Promise.all(docs.map(async (doc) => {
    const base = { ...doc, _uploadedByName: doc.uploadedBy ? uploaderMap.get(doc.uploadedBy) || null : null };
    if (doc.status !== "processed") return base;

    try {
      if (doc.processingType === "ghid") {
        const [rulesResult] = await db.select({ count: sql<number>`count(*)` }).from(rules).where(eq(rules.documentId, doc.id));
        const [scoringResult] = await db.select({ count: sql<number>`count(*)` }).from(scoringCriteria).where(eq(scoringCriteria.documentId, doc.id));
        const [elemDefResult] = await db.select({ count: sql<number>`count(*)` }).from(elementDefinitions).where(eq(elementDefinitions.guideDocumentId, doc.id));
        return {
          ...base,
          _summary: {
            rulesCount: Number(rulesResult?.count || 0),
            scoringCount: Number(scoringResult?.count || 0),
            elementsCount: Number(elemDefResult?.count || 0),
            trustScore: doc.trustScore ? Number(doc.trustScore) : null,
            completenessReport: doc.completenessReport || null,
          },
        };
      }
      if (doc.processingType === "template") {
        const [elResult] = await db.select({ count: sql<number>`count(*)` }).from(templateElements).where(eq(templateElements.documentId, doc.id));
        return {
          ...base,
          _summary: { fieldsCount: Number(elResult?.count || 0) },
        };
      }
    } catch { /* non-critical enrichment */ }
    return base;
  }));

  return c.json(enriched);
});

// --- UPLOAD VALIDATION ---

/** Allowed MIME types mapped to our internal file type */
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "application/msword": "doc",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** Fallback: detect file type from extension when MIME is generic */
const EXT_TO_FILETYPE: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  doc: "doc",
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
};

/** Max file size per processing type (bytes) */
const MAX_SIZE: Record<string, number> = {
  ghid: 50 * 1024 * 1024,          // 50 MB — ghiduri are large PDFs
  reference_data: 30 * 1024 * 1024, // 30 MB
  template: 20 * 1024 * 1024,       // 20 MB
  client_doc: 20 * 1024 * 1024,     // 20 MB
  reference: 20 * 1024 * 1024,      // 20 MB
};

/** Sanitize filename for AFIR compliance: remove diacritics, special chars */
function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/[ăâ]/gi, "a").replace(/[îì]/gi, "i")
    .replace(/[șş]/gi, "s").replace(/[țţ]/gi, "t")
    .replace(/[^a-zA-Z0-9._\-\s]/g, "_")              // only safe chars
    .replace(/\s+/g, "_")                              // spaces → underscore
    .replace(/_+/g, "_")                               // collapse multiple _
    .replace(/^_|_$/g, "");                            // trim _ from edges
}

/** Compute SHA-256 hash of buffer */
function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Map folder type + explicit sub-type → processing type */
function resolveProcessingType(folderType: string, explicitType: string | null): string {
  if (explicitType === "reference_data" && folderType === "ghiduri") return "reference_data";
  if (explicitType === "ghid" && folderType === "ghiduri") return "ghid";
  if (folderType === "ghiduri") return "ghid";
  // template_fill and template_compose both use "template" processing type
  // (the distinction is stored in generationMode on the document record)
  if (explicitType === "template_fill" || explicitType === "template_compose") return "template";
  if (folderType === "templateuri") return "template";
  if (folderType === "clienti_prospecti" || folderType === "clienti_finali") return "client_doc";
  return "reference";
}

/** Resolve generation mode from explicit processing type */
function resolveGenerationMode(explicitType: string | null): "fill" | "compose" {
  if (explicitType === "template_compose") return "compose";
  return "fill";
}

/** Heuristic: resolve documentTypeClass from template filename */
function resolveTemplateTypeClass(fileName: string, fileType: string): string {
  const name = fileName.toLowerCase();
  if (/anexa.*[_\s-]?c/i.test(name)) return "anexa_c_template";
  if (/anexa.*[_\s-]?b/i.test(name)) return "anexa_b_template";
  if (/cerere.*finan[tț]|cererea/i.test(name)) return "cerere_finantare_template";
  if (/memoriu/i.test(name)) return "memoriu_template";
  // Default by extension
  if (fileType === "docx") return "memoriu_template";
  if (fileType === "pdf") return "cerere_finantare_template";
  return "other";
}

// --- PRESIGNED UPLOAD URL (direct browser → R2 upload, bypasses Node memory) ---
const presignedSchema = z.object({
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
  folder_id: z.string().uuid(),
  processing_type: z.string().optional(),
});

documentRoutes.post("/presigned-url", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  await ensureDocumentColumns();
  const body = presignedSchema.parse(await c.req.json());

  // Validate folder exists and belongs to org
  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, body.folder_id), eq(documentFolders.organizationId, auth.organizationId)),
  });
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  // Validate file type
  const ext = body.filename.split(".").pop()?.toLowerCase() || "";
  let fileType = ALLOWED_MIME_TYPES[body.mime_type];
  if (!fileType) fileType = EXT_TO_FILETYPE[ext];
  if (!fileType) {
    return c.json({
      error: `Tip de fișier neacceptat: ${body.mime_type || ext}. Acceptăm: PDF, DOCX, XLSX, XLS, DOC.`,
    }, 400);
  }

  // Validate size
  const processingType = resolveProcessingType(folder.type, body.processing_type || null);
  const maxSize = MAX_SIZE[processingType] || MAX_SIZE.reference;
  if (body.size_bytes > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return c.json({
      error: `Fișierul depășește limita de ${maxMB} MB pentru tipul "${processingType}".`,
    }, 400);
  }

  // Determine upload context
  const uploadContext = processingType === "ghid" || processingType === "reference_data"
    ? "guides" : processingType === "template" ? "templates" : "uploads";

  console.log(`[PRESIGNED] Requesting presigned URL: file=${body.filename}, size=${body.size_bytes}, type=${processingType}, folder=${folder.type}/${body.folder_id}`);

  let presignedUrl: string, fileId: string, storageKey: string, expiresIn: number;
  try {
    const result = await createPresignedUploadUrl(
      body.filename,
      body.mime_type,
      body.size_bytes,
      auth.organizationId,
      auth.userId,
      uploadContext,
    );
    presignedUrl = result.presignedUrl;
    fileId = result.fileId;
    storageKey = result.storageKey;
    expiresIn = result.expiresIn;
  } catch (storageErr: any) {
    console.error(`[PRESIGNED] Storage presigned URL failed:`, storageErr.message, storageErr.stack);
    return c.json({ error: `Eroare la pregătirea upload-ului: ${storageErr.message}` }, 500);
  }

  // Sanitize filename
  const rawName = body.filename.replace(/\.[^.]+$/, "");
  const safeName = sanitizeFilename(rawName) || rawName;

  // Resolve generation mode for templates
  const generationMode = processingType === "template" ? resolveGenerationMode(body.processing_type || null) : "fill";

  // Pre-create document record in "uploaded" status (will be confirmed later)
  let doc: any;
  try {
    const [inserted] = await db.insert(documents).values({
      folderId: body.folder_id,
      organizationId: auth.organizationId,
      name: safeName,
      fileType: fileType as any,
      mimeType: body.mime_type || `application/${ext}`,
      fileId,
      fileSize: body.size_bytes,
      fileHash: null,
      status: "uploaded",
      processingType: processingType as any,
      generationMode: generationMode as any,
      documentTypeClass: processingType === "ghid" ? "guide" as any : processingType === "template" ? resolveTemplateTypeClass(body.filename, fileType) as any : null,
      tags: [],
      uploadedBy: auth.userId,
    }).returning();
    doc = inserted;
  } catch (dbErr: any) {
    console.error(`[PRESIGNED] DB insert failed:`, dbErr.message, dbErr.stack);
    return c.json({ error: `Eroare la salvarea documentului: ${dbErr.message}` }, 500);
  }

  console.log(`[PRESIGNED] Success: docId=${doc.id}, presigned=${presignedUrl.substring(0, 60)}...`);

  return c.json({
    presigned_url: presignedUrl,
    document_id: doc.id,
    file_id: fileId,
    storage_key: storageKey,
    expires_in: expiresIn,
  }, 201);
});

// --- CONFIRM UPLOAD (after browser uploads directly to R2) ---
documentRoutes.post("/documents/:id/confirm-upload", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  await ensureDocumentColumns();

  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  // Verify the file actually exists in storage
  const fileRecord = await db.query.files.findFirst({ where: eq(files.id, doc.fileId) });
  if (!fileRecord) {
    return c.json({ error: "Înregistrarea fișierului lipsește din baza de date." }, 400);
  }

  const { exists, size } = await verifyFileUploaded(fileRecord.storageKey);

  if (!exists) {
    return c.json({ error: "Fișierul nu a fost găsit în storage. Reîncearcă upload-ul." }, 400);
  }

  // Update file size with actual uploaded size
  if (size > 0 && size !== doc.fileSize) {
    await db.update(files).set({ size }).where(eq(files.id, doc.fileId));
    await db.update(documents).set({ fileSize: size }).where(eq(documents.id, id));
  }

  // Dispatch BullMQ processing job and set status to "processing"
  const warnings: string[] = [];
  // W6.5: Check Redis readiness before attempting queue dispatch
  if (!isRedisReady()) {
    warnings.push("Procesarea automată nu a pornit (Redis indisponibil). Poți reporni manual din meniul documentului.");
  } else {
    try {
      const jobPayload = { documentId: doc.id, organizationId: auth.organizationId };
      const dedup = { jobId: `doc-${doc.id}` };
      let dispatched = false;
      if (doc.processingType === "ghid") {
        await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE, ...dedup });
        dispatched = true;
      } else if (doc.processingType === "template") {
        await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE, ...dedup });
        dispatched = true;
      } else if (doc.processingType === "reference_data") {
        await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA, ...dedup });
        dispatched = true;
      } else if (doc.processingType === "client_doc") {
        await processClientDocQueue.add("process-client-doc", jobPayload, { priority: JOB_PRIORITY.CLIENT_DOC, ...dedup });
        dispatched = true;
      }
      // Mark as processing only if a job was actually dispatched
      if (dispatched) {
        await db.update(documents).set({ status: "processing" }).where(eq(documents.id, id));
      }
    } catch (queueErr: any) {
      console.error(`Queue dispatch failed for document ${doc.id}:`, queueErr.message);
      warnings.push("Procesarea automată nu a pornit (Redis indisponibil). Poți reporni manual din meniul documentului.");
    }
  }

  // SSE notification
  publishUploadEvent(auth.organizationId, {
    documentId: doc.id,
    documentName: doc.name,
    status: "processing",
    processingType: doc.processingType || "reference",
    message: `Document uploadat "${doc.name}", procesare în curs...`,
  }).catch((e: any) => console.warn("[documents] SSE confirm-upload event:", e.message));

  return c.json({ ok: true, document_id: doc.id, actual_size: size, warnings: warnings.length > 0 ? warnings : undefined });
});

// --- LOCAL UPLOAD (dev fallback when S3 is not configured) ---
// Handles the PUT request from the frontend when presigned URL points to local API
documentRoutes.put("/local-upload/:fileId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  await ensureDocumentColumns();
  if (!isLocalStorage) return c.json({ error: "Local upload not available in S3 mode" }, 400);

  const fileId = c.req.param("fileId");
  const fileRecord = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.organizationId, auth.organizationId)),
  });
  if (!fileRecord) return c.json({ error: "File record not found" }, 404);

  // Read the raw body as buffer
  const buffer = Buffer.from(await c.req.arrayBuffer());

  // Write to local filesystem at the storage key path
  const { existsSync, mkdirSync, writeFileSync } = await import("fs");
  const { join, dirname } = await import("path");
  const fullPath = join(process.cwd(), "uploads", fileRecord.storageKey);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, buffer);

  // Update actual file size
  await db.update(files).set({ size: buffer.length }).where(eq(files.id, fileId));

  return c.json({ ok: true, size: buffer.length });
});

// --- UPLOAD DOCUMENT (legacy — buffers through Node, still works for small files) ---
documentRoutes.post("/folders/:folderId/documents", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const folderId = c.req.param("folderId");

  await ensureDocumentColumns();

  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, folderId), eq(documentFolders.organizationId, auth.organizationId!)),
  });
  if (!folder) {
    console.error(`[UPLOAD] Folder not found: folderId=${folderId}, orgId=${auth.organizationId}`);
    return c.json({ error: "Folder not found" }, 404);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch (err: any) {
    console.error(`[UPLOAD] FormData parse failed:`, err.message, err.stack);
    return c.json({ error: `Eroare la citirea fișierului: ${err.message}` }, 400);
  }
  const file = formData.get("file") as File;
  const rawTags = formData.get("tags") as string || "";
  let tags: string[] = [];
  try { tags = JSON.parse(rawTags); if (!Array.isArray(tags)) tags = []; } catch { tags = rawTags.split(",").filter(Boolean); }

  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  // --- Resolve file type from MIME + extension ---
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  let fileType = ALLOWED_MIME_TYPES[file.type];
  if (!fileType) {
    fileType = EXT_TO_FILETYPE[ext];
  }
  if (!fileType) {
    return c.json({
      error: `Tip de fișier neacceptat: ${file.type || ext}. Acceptăm: PDF, DOCX, XLSX, XLS, DOC.`,
    }, 400);
  }

  // --- Validate file size ---
  const explicitType = formData.get("processingType") as string | null;
  const processingType = resolveProcessingType(folder.type, explicitType);
  const maxSize = MAX_SIZE[processingType] || MAX_SIZE.reference;
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return c.json({
      error: `Fișierul depășește limita de ${maxMB} MB pentru tipul "${processingType}".`,
    }, 400);
  }

  // --- Read buffer + compute hash ---
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = fileHash(buffer);

  // --- Duplicate detection (same hash in same org) → warning, not blocking ---
  const existing = await db.query.documents.findFirst({
    where: and(
      eq(documents.organizationId, auth.organizationId!),
      eq(documents.fileHash, hash),
    ),
  });
  const duplicateWarning = existing
    ? `Fișier identic deja uploadat: "${existing.name}" (${existing.id}). Documentul a fost uploadat oricum.`
    : null;

  // --- Sanitize filename ---
  const rawName = file.name.replace(/\.[^.]+$/, "");
  const safeName = sanitizeFilename(rawName) || rawName;

  // --- .doc legacy warning ---
  const docWarning = fileType === "doc"
    ? "Format .doc (legacy). Conversia automată la .docx va fi realizată la procesare."
    : null;

  // --- Upload to R2 with context path + metadata ---
  const uploadContext = processingType === "ghid" || processingType === "reference_data"
    ? "guides" : processingType === "template" ? "templates" : "uploads";

  console.log(`[UPLOAD] Uploading file: name=${file.name}, size=${buffer.length}, type=${file.type}, processingType=${processingType}, folder=${folder.type}/${folderId}`);

  let fileId: string;
  try {
    fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId, uploadContext);
  } catch (storageErr: any) {
    console.error(`[UPLOAD] Storage upload failed:`, storageErr.message, storageErr.stack);
    return c.json({ error: `Eroare la stocarea fișierului: ${storageErr.message}` }, 500);
  }

  // --- Resolve generation mode for templates ---
  const generationMode = processingType === "template" ? resolveGenerationMode(explicitType) : "fill";

  // --- Create DB record ---
  let doc: any;
  try {
    const [inserted] = await db.insert(documents).values({
      folderId,
      organizationId: auth.organizationId!,
      name: safeName,
      fileType: fileType as any,
      mimeType: file.type || `application/${ext}`,
      fileId,
      fileSize: buffer.length,
      fileHash: hash,
      status: "uploaded",
      processingType: processingType as any,
      generationMode: generationMode as any,
      documentTypeClass: processingType === "ghid" ? "guide" as any : processingType === "template" ? resolveTemplateTypeClass(file.name, fileType) as any : null,
      tags,
      uploadedBy: auth.userId,
    }).returning();
    doc = inserted;
  } catch (dbErr: any) {
    console.error(`[UPLOAD] DB insert failed:`, dbErr.message, dbErr.stack);
    return c.json({ error: `Eroare la salvarea documentului: ${dbErr.message}` }, 500);
  }

  // --- Response with warnings ---
  const warnings: string[] = [];
  if (duplicateWarning) warnings.push(duplicateWarning);
  if (docWarning) warnings.push(docWarning);

  // --- Dispatch BullMQ job with priority and set status to "processing" ---
  // W6.5: Check Redis readiness before attempting queue dispatch
  if (!isRedisReady()) {
    warnings.push("Procesarea automată nu a pornit (Redis indisponibil). Poți reporni manual din meniul documentului.");
  } else {
    try {
      const jobPayload = { documentId: doc.id, organizationId: auth.organizationId! };
      const dedup = { jobId: `doc-${doc.id}` };
      let dispatched = false;
      if (processingType === "ghid") {
        await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE, ...dedup });
        dispatched = true;
      } else if (processingType === "template") {
        await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE, ...dedup });
        dispatched = true;
      } else if (processingType === "reference_data") {
        await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA, ...dedup });
        dispatched = true;
      } else if (processingType === "client_doc") {
        await processClientDocQueue.add("process-client-doc", jobPayload, { priority: JOB_PRIORITY.CLIENT_DOC, ...dedup });
        dispatched = true;
      }
      // Mark as processing only if a job was actually dispatched
      if (dispatched) {
        await db.update(documents).set({ status: "processing" }).where(eq(documents.id, doc.id));
        doc = { ...doc, status: "processing" };
      }
    } catch (queueErr: any) {
      console.error(`Queue dispatch failed for document ${doc.id}:`, queueErr.message);
      warnings.push("Procesarea automată nu a pornit (Redis indisponibil). Poți reporni manual din meniul documentului.");
    }
  }

  // --- SSE notification ---
  publishUploadEvent(auth.organizationId!, {
    documentId: doc.id,
    documentName: safeName,
    status: doc.status,
    processingType,
    message: `Document uploadat "${safeName}", procesare în curs...`,
  }).catch((e: any) => console.warn("[documents] SSE upload event:", e.message)); // fire and forget

  return c.json({ ...doc, warnings: warnings.length > 0 ? warnings : undefined }, 201);
});

// --- DOCUMENT DETAILS ---
documentRoutes.get("/documents/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  const downloadUrl = await getFileUrl(doc.fileId);

  return c.json({ ...doc, downloadUrl });
});

// --- DELETE DOCUMENT ---
documentRoutes.delete("/documents/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  // Try to remove any pending/waiting BullMQ jobs for this document
  try {
    const queueMap: Record<string, typeof processGuideQueue> = {
      ghid: processGuideQueue,
      template: processTemplateQueue,
      reference_data: processReferenceDataQueue,
      client_doc: processClientDocQueue,
    };
    const q = queueMap[doc.processingType || ""];
    if (q) {
      const jobs = await q.getJobs(["waiting", "delayed", "active"]);
      for (const job of jobs) {
        if (job.data?.documentId === id) {
          await job.remove().catch((e: any) => console.warn("[documents] queue job removal:", e.message));
        }
      }
    }
  } catch (_) {
    // Queue cleanup is best-effort; don't block deletion
  }

  const fileId = doc.fileId;

  try {
    // Manual cascade cleanup — ensures clean deletion even if DB FK constraints
    // were created without ON DELETE CASCADE (migration 0000 used "no action")
    // Order matters: delete leaf tables first, then parents

    // 1. Guide-specific: rules → ruleReferenceLinks, elementRuleLinks, projectEligibility cascade
    const docRules = await db.select({ id: rules.id }).from(rules).where(eq(rules.documentId, id));
    if (docRules.length > 0) {
      const ruleIds = docRules.map(r => r.id);
      await db.delete(ruleReferenceLinks).where(inArray(ruleReferenceLinks.ruleId, ruleIds)).catch(() => {});
      await db.delete(elementRuleLinks).where(inArray(elementRuleLinks.ruleId, ruleIds)).catch(() => {});
    }

    // 2. Guide-specific: elementDefinitions → set null on projectElements (preserve project data)
    const docElemDefs = await db.select({ id: elementDefinitions.id }).from(elementDefinitions)
      .where(eq(elementDefinitions.guideDocumentId, id));
    if (docElemDefs.length > 0) {
      const defIds = docElemDefs.map(d => d.id);
      // Unlink from project elements (don't delete them — user said to preserve projects)
      await db.update(projectElements).set({ elementDefId: null })
        .where(inArray(projectElements.elementDefId, defIds)).catch(() => {});
      // Delete elementRuleLinks for these defs
      await db.delete(elementRuleLinks).where(inArray(elementRuleLinks.elementDefId, defIds)).catch(() => {});
      // Delete templatePlaceholderMappings for these defs
      await db.delete(templatePlaceholderMapping).where(inArray(templatePlaceholderMapping.elementDefId, defIds)).catch(() => {});
    }

    // 3. Reference tables
    await db.delete(guideReferenceTables).where(eq(guideReferenceTables.documentId, id)).catch(() => {});

    // 4. Scoring criteria
    await db.delete(scoringCriteria).where(eq(scoringCriteria.documentId, id)).catch(() => {});

    // 5. Rules themselves
    await db.delete(rules).where(eq(rules.documentId, id)).catch(() => {});

    // 6. Element definitions
    await db.delete(elementDefinitions).where(eq(elementDefinitions.guideDocumentId, id)).catch(() => {});

    // 7. Template-specific: template elements, placeholder mappings
    await db.delete(templateElements).where(eq(templateElements.documentId, id)).catch(() => {});
    await db.delete(templatePlaceholderMapping).where(eq(templatePlaceholderMapping.templateDocumentId, id)).catch(() => {});

    // 8. Project documents (generated docs from this template)
    await db.delete(projectDocuments).where(eq(projectDocuments.templateDocumentId, id)).catch(() => {});

    // 9. Session checklist — set null for template_id
    await db.update(sessionChecklist).set({ templateId: null })
      .where(eq(sessionChecklist.templateId, id)).catch(() => {});

    // 10. Now delete the document itself (should succeed with all refs cleaned)
    await db.delete(documents).where(eq(documents.id, id));

    // 11. Delete the file from storage + files table
    await deleteFile(fileId).catch((e: any) => {
      console.warn(`[documents] Storage cleanup failed for fileId ${fileId}:`, e.message);
    });

    return c.json({ ok: true });
  } catch (err: any) {
    console.error(`[documents] Delete document ${id} failed:`, err.message, err.stack);
    return c.json({ error: `Eroare la ștergerea documentului: ${err.message}` }, 500);
  }
});

// --- REPLACE DOCUMENT FILE (re-upload) ---
// Keeps the same document record but swaps the underlying file,
// clears all extracted data (rules, elements, criteria), and re-queues processing.
documentRoutes.post("/documents/:id/replace", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  // Only allow replacing processable document types
  const replaceableTypes = ["ghid", "template", "reference_data"];
  if (!replaceableTypes.includes(doc.processingType || "")) {
    return c.json({ error: `Tipul "${doc.processingType}" nu suportă înlocuire.` }, 400);
  }

  // Expect multipart/form-data with a single "file" field
  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "Fișier lipsă. Trimite un câmp 'file' în form-data." }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");
  const ext = file.name.split(".").pop() || "pdf";
  const mimeType = file.type || "application/octet-stream";

  // 1. Delete old file from storage
  await deleteFile(doc.fileId).catch(() => {});

  // 2. Upload new file
  const fileId = await uploadFile(buffer, file.name, mimeType, auth.organizationId!, auth.userId, "docs");

  // 3. Clear extracted data — delete from child tables that reference this document.
  //    CASCADE handles nested children (ruleReferenceLinks, elementRuleLinks, etc.)
  await Promise.all([
    db.delete(rules).where(eq(rules.documentId, id)),
    db.delete(elementDefinitions).where(eq(elementDefinitions.guideDocumentId, id)),
    db.delete(scoringCriteria).where(eq(scoringCriteria.documentId, id)),
    db.delete(guideReferenceTables).where(eq(guideReferenceTables.documentId, id)),
    db.delete(templateElements).where(eq(templateElements.documentId, id)),
  ]);

  // 4. Update document record with new file info
  await db.update(documents).set({
    fileId,
    fileSize: buffer.length,
    fileType: ext as "pdf" | "docx" | "xlsx" | "doc" | "png" | "jpg",
    mimeType,
    fileHash: hash,
    name: file.name.replace(/\.[^.]+$/, ""),
    status: "processing",
    processingError: null,
    processingResult: null,
    trustScore: null,
    completenessReport: null,
    pageCount: null,
  }).where(eq(documents.id, id));

  // 5. Dispatch processing
  try {
    if (!isRedisReady()) {
      await db.update(documents).set({ status: "uploaded" }).where(eq(documents.id, id));
      return c.json({ ok: true, documentId: id, warning: "Fișier înlocuit, dar procesarea nu a pornit (Redis indisponibil)." });
    }
    const jobPayload = { documentId: id, organizationId: auth.organizationId };
    const dedup = { jobId: `replace-${id}-${Date.now()}` };
    if (doc.processingType === "ghid") {
      await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE, ...dedup });
    } else if (doc.processingType === "template") {
      await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE, ...dedup });
    } else if (doc.processingType === "reference_data") {
      await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA, ...dedup });
    }
  } catch (queueErr: any) {
    console.error(`[replace] Queue dispatch failed for ${id}:`, queueErr.message);
    await db.update(documents).set({ status: "uploaded" }).where(eq(documents.id, id));
    return c.json({ ok: true, documentId: id, warning: "Fișier înlocuit, dar procesarea nu a pornit." });
  }

  return c.json({ ok: true, documentId: id, message: "Fișier înlocuit și procesare pornită." });
});

// --- MANUAL PROCESS ---
documentRoutes.post("/documents/:id/process", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Parse optional body — mode: "smart" does diff/merge instead of full replace
  let mode: "full" | "smart" = "full";
  try {
    const body = await c.req.json().catch(() => ({}));
    if (body.mode === "smart") mode = "smart";
  } catch { /* no body is fine */ }

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  // Only dispatch types that have a processing queue
  const dispatchableTypes = ["ghid", "template", "reference_data", "client_doc"];
  if (!dispatchableTypes.includes(doc.processingType || "")) {
    return c.json({ error: `Tipul "${doc.processingType}" nu necesită procesare AI.` }, 400);
  }

  // W6.5: Check Redis readiness before attempting reprocess
  if (!isRedisReady()) {
    return c.json({ error: "Serviciul de procesare nu este disponibil (Redis offline). Reîncercați mai târziu." }, 503);
  }

  await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, id));

  try {
    const jobPayload = { documentId: doc.id, organizationId: auth.organizationId!, reprocessMode: mode };
    const dedup = { jobId: `reprocess-${doc.id}-${Date.now()}` };
    if (doc.processingType === "ghid") {
      await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE, ...dedup });
    } else if (doc.processingType === "template") {
      await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE, ...dedup });
    } else if (doc.processingType === "reference_data") {
      await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA, ...dedup });
    } else if (doc.processingType === "client_doc") {
      await processClientDocQueue.add("process-client-doc", jobPayload, { priority: JOB_PRIORITY.CLIENT_DOC, ...dedup });
    }
  } catch (queueErr: any) {
    console.error(`Queue dispatch failed for document ${doc.id}:`, queueErr.message);
    await db.update(documents).set({ status: "uploaded" }).where(eq(documents.id, id));
    return c.json({ error: "Procesarea nu a pornit — Redis indisponibil. Reîncearcă mai târziu." }, 503);
  }

  return c.json({ ok: true, message: mode === "smart" ? "Reactualizare pornită (mod inteligent)" : "Procesare pornită" });
});

// --- TEMPLATE ELEMENTS FOR DOCUMENT ---
documentRoutes.get("/documents/:id/elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  const elements = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, id),
    orderBy: (e, { asc }) => [asc(e.pageNum), asc(e.lineNum)],
  });

  // Group by page
  const pageMap = new Map<number, typeof elements>();
  for (const el of elements) {
    const pg = el.pageNum || 1;
    const arr = pageMap.get(pg) || [];
    arr.push(el);
    pageMap.set(pg, arr);
  }

  const pages = [...pageMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([num, els]) => ({
      num,
      elements: els,
      totalElements: els.length,
      validatedElements: els.filter(e => e.validated).length,
    }));

  return c.json({
    documentId: id,
    documentName: doc.name,
    fileType: doc.fileType,
    pageCount: doc.pageCount || pages.length,
    totalElements: elements.length,
    validatedElements: elements.filter(e => e.validated).length,
    pages,
  });
});

// --- VALIDATE / UPDATE TEMPLATE ELEMENT ---
documentRoutes.put("/documents/:docId/elements/:elId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { docId, elId } = c.req.param() as { docId: string; elId: string };
  const body = updateDocElementSchema.parse(await c.req.json());

  const el = await db.query.templateElements.findFirst({
    where: and(eq(templateElements.id, elId), eq(templateElements.documentId, docId)),
  });
  if (!el) return c.json({ error: "Element not found" }, 404);

  const updateData: Record<string, any> = {};
  if (body.validated !== undefined) {
    updateData.validated = body.validated;
    updateData.validatedBy = body.validated ? auth.userId : null;
  }
  if (body.label !== undefined) updateData.label = body.label;
  if (body.fieldType !== undefined) updateData.fieldType = body.fieldType;
  if (body.group !== undefined) updateData.group = body.group;

  const [updated] = await db.update(templateElements)
    .set(updateData)
    .where(eq(templateElements.id, elId))
    .returning();

  return c.json(updated);
});

// --- BATCH VALIDATE ALL ELEMENTS ON A PAGE ---
documentRoutes.put("/documents/:docId/elements-validate-page", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const { pageNum, validated } = validatePageSchema.parse(await c.req.json());

  const elements = await db.query.templateElements.findMany({
    where: and(eq(templateElements.documentId, docId), eq(templateElements.pageNum, pageNum)),
  });

  for (const el of elements) {
    await db.update(templateElements)
      .set({ validated, validatedBy: validated ? auth.userId : null })
      .where(eq(templateElements.id, el.id));
  }

  return c.json({ ok: true, count: elements.length });
});

// --- ADD MANUAL TEMPLATE ELEMENT ---
documentRoutes.post("/documents/:docId/elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const body = createDocElementSchema.parse(await c.req.json());

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  const [el] = await db.insert(templateElements).values({
    documentId: docId,
    organizationId: auth.organizationId!,
    key: body.key,
    label: body.label,
    fieldType: body.fieldType,
    pageNum: body.pageNum || 1,
    lineNum: body.lineNum || 0,
    group: body.group || null,
    detected: false,
    validated: false,
  }).returning();

  return c.json(el, 201);
});

// --- DELETE TEMPLATE ELEMENT ---
documentRoutes.delete("/documents/:docId/elements/:elId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { docId, elId } = c.req.param() as { docId: string; elId: string };

  // Verify document belongs to user's org
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  await db.delete(templateElements).where(
    and(eq(templateElements.id, elId), eq(templateElements.documentId, docId))
  );

  return c.json({ ok: true });
});

// --- SCORING SUMMARY for a document (GAP 21) ---
documentRoutes.get("/documents/:docId/scoring-summary", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { docId } = c.req.param() as { docId: string };

  const criteria = await db.query.scoringCriteria.findMany({
    where: and(eq(scoringCriteria.documentId, docId), eq(scoringCriteria.organizationId, auth.organizationId!)),
  });

  return c.json(criteria.map(cr => ({
    name: cr.name,
    maxPoints: cr.maxPoints,
    evaluationLogic: cr.evaluationLogic,
    category: cr.category,
  })));
});

// --- ELEMENT DEFINITIONS for a guide document ---
documentRoutes.get("/documents/:docId/elements-summary", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { docId } = c.req.param() as { docId: string };

  const elements = await db.query.elementDefinitions.findMany({
    where: and(eq(elementDefinitions.guideDocumentId, docId), eq(elementDefinitions.organizationId, auth.organizationId!)),
    orderBy: (e, { asc }) => [asc(e.collectionOrder)],
  });

  return c.json(elements.map(el => ({
    elementKey: el.elementKey,
    displayName: el.displayName,
    category: el.category,
    dataType: el.dataType,
    unit: el.unit,
    required: el.required,
  })));
});

// --- TEMPLATE ELEMENTS with mapping/source info ---
documentRoutes.get("/documents/:docId/template-elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { docId } = c.req.param() as { docId: string };

  // Get template elements for this document
  const elements = await db.query.templateElements.findMany({
    where: and(eq(templateElements.documentId, docId), eq(templateElements.organizationId, auth.organizationId!)),
    orderBy: (e, { asc }) => [asc(e.group), asc(e.key)],
  });

  if (elements.length === 0) return c.json({ elements: [], total: 0, mapped: 0, unmapped: 0 });

  // Get mappings for this template document
  const mappings = await db.query.templatePlaceholderMapping.findMany({
    where: eq(templatePlaceholderMapping.templateDocumentId, docId),
  });
  const mappingByKey = new Map(mappings.map(m => [m.placeholderKey, m]));

  // Get element definitions for mapped elements
  const mappedDefIds = mappings.map(m => m.elementDefId).filter(Boolean);
  let defMap = new Map<string, { category: string; sourcePriority: string[] | null; displayName: string }>();
  if (mappedDefIds.length > 0) {
    const defs = await db.query.elementDefinitions.findMany({
      where: sql`${elementDefinitions.id} IN (${sql.join(mappedDefIds.map(id => sql`${id}`), sql`, `)})`,
      columns: { id: true, category: true, sourcePriority: true, displayName: true },
    });
    for (const d of defs) defMap.set(d.id, { category: d.category, sourcePriority: d.sourcePriority, displayName: d.displayName });
  }

  // Derive source badge from element category
  function deriveSource(category: string | null): string {
    if (!category) return "solomon";
    switch (category) {
      case "beneficiary": return "onrc";
      case "financial": return "anaf";
      case "legal": return "onrc";
      case "location": return "onrc";
      case "farm": return "onrc";
      case "investment": return "solomon";
      case "technical": return "solomon";
      default: return "solomon";
    }
  }

  const enriched = elements.map(el => {
    const mapping = mappingByKey.get(el.key);
    const def = mapping ? defMap.get(mapping.elementDefId) : null;
    const source = def ? deriveSource(def.category) : "solomon";
    return {
      id: el.id,
      key: el.key,
      label: el.label,
      fieldType: el.fieldType,
      group: el.group,
      mapped: !!mapping,
      mappingId: mapping?.id || null,
      mappingValidated: mapping?.validated ?? false,
      elementDefId: mapping?.elementDefId || null,
      elementDefName: def?.displayName || null,
      confidence: mapping?.confidence ? parseFloat(mapping.confidence) : null,
      category: def?.category || null,
      source,
    };
  });

  const mapped = enriched.filter(e => e.mapped).length;
  const validated = enriched.filter(e => e.mappingValidated).length;
  return c.json({
    elements: enriched,
    total: enriched.length,
    mapped,
    unmapped: enriched.length - mapped,
    validated,
  });
});

// ═══════════════════════════════════════════════════════════════════
// SESSION LIBRARY — Aggregated view of all data extracted from guides
// ═══════════════════════════════════════════════════════════════════

documentRoutes.get("/session/:folderId/library", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { folderId } = c.req.param();

  // Verify folder belongs to org and is a sesiune
  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, folderId), eq(documentFolders.organizationId, auth.organizationId)),
  });
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  // Get ALL guide folders under this session
  const guideFolders = await db.query.documentFolders.findMany({
    where: and(eq(documentFolders.parentId, folderId), eq(documentFolders.type, "ghiduri")),
  });

  // Get ALL template folders under this session
  const templateFolders = await db.query.documentFolders.findMany({
    where: and(eq(documentFolders.parentId, folderId), eq(documentFolders.type, "templateuri")),
  });

  // Collect all guide and template documents
  const guideFolderIds = guideFolders.map(f => f.id);
  const templateFolderIds = templateFolders.map(f => f.id);

  const guideDocs = guideFolderIds.length > 0
    ? await db.query.documents.findMany({
        where: and(inArray(documents.folderId, guideFolderIds), eq(documents.organizationId, auth.organizationId)),
      })
    : [];

  const templateDocs = templateFolderIds.length > 0
    ? await db.query.documents.findMany({
        where: and(inArray(documents.folderId, templateFolderIds), eq(documents.organizationId, auth.organizationId)),
      })
    : [];

  const guideDocIds = guideDocs.map(d => d.id);
  const templateDocIds = templateDocs.map(d => d.id);
  const allDocIds = [...guideDocIds, ...templateDocIds];

  // === 1. RULES ===
  const allRules = guideDocIds.length > 0
    ? await db.query.rules.findMany({
        where: and(inArray(rules.documentId, guideDocIds), eq(rules.organizationId, auth.organizationId)),
        orderBy: (r, { asc: a }) => [a(r.sourcePage), a(r.createdAt)],
      })
    : [];

  // Enrich rules with source document name + linked elements
  const docNameMap = new Map([...guideDocs, ...templateDocs].map(d => [d.id, { name: d.name, fileType: d.fileType }]));

  // Batch-load element_rule_links for all rules
  const ruleIds = allRules.map(r => r.id);
  const allElemLinks = ruleIds.length > 0
    ? await db.query.elementRuleLinks.findMany({
        where: inArray(elementRuleLinks.ruleId, ruleIds),
      })
    : [];
  const linkedElemDefIds = [...new Set(allElemLinks.map(l => l.elementDefId).filter(Boolean))] as string[];
  const linkedElemDefs = linkedElemDefIds.length > 0
    ? await db.query.elementDefinitions.findMany({
        where: inArray(elementDefinitions.id, linkedElemDefIds),
      })
    : [];
  const elemDefById = new Map(linkedElemDefs.map(ed => [ed.id, ed]));
  // Group links by ruleId
  const elemLinksByRule = new Map<string, Array<{ elementKey: string; displayName: string; category: string | null; role: string }>>();
  for (const link of allElemLinks) {
    const ed = link.elementDefId ? elemDefById.get(link.elementDefId) : null;
    if (!ed) continue;
    const existing = elemLinksByRule.get(link.ruleId) || [];
    existing.push({
      elementKey: ed.elementKey,
      displayName: ed.displayName || ed.elementKey,
      category: ed.category,
      role: link.role,
    });
    elemLinksByRule.set(link.ruleId, existing);
  }

  const enrichedRules = allRules.map(r => ({
    ...r,
    sourceDocument: docNameMap.get(r.documentId) || null,
    linkedElements: elemLinksByRule.get(r.id) || [],
  }));

  // === 2. SCORING CRITERIA ===
  const allScoring = guideDocIds.length > 0
    ? await db.query.scoringCriteria.findMany({
        where: and(inArray(scoringCriteria.documentId, guideDocIds), eq(scoringCriteria.organizationId, auth.organizationId)),
        orderBy: (s, { asc: a }) => [a(s.sortOrder)],
      })
    : [];

  const enrichedScoring = allScoring.map(s => ({
    ...s,
    sourceDocument: docNameMap.get(s.documentId) || null,
  }));

  // === 3. ELEMENT DEFINITIONS ===
  const allElementDefs = guideDocIds.length > 0
    ? await db.query.elementDefinitions.findMany({
        where: and(
          sql`${elementDefinitions.guideDocumentId} IN (${sql.join(guideDocIds.map(id => sql`${id}`), sql`, `)})`,
          eq(elementDefinitions.organizationId, auth.organizationId),
        ),
        orderBy: (e, { asc: a }) => [a(e.category), a(e.collectionOrder)],
      })
    : [];

  // Also get manually-created elementDefs (guideDocumentId is null but org matches)
  const manualElementDefs = await db.query.elementDefinitions.findMany({
    where: and(
      isNull(elementDefinitions.guideDocumentId),
      eq(elementDefinitions.organizationId, auth.organizationId),
    ),
  });

  const combinedElementDefs = [...allElementDefs, ...manualElementDefs];

  // Get mapping counts per elementDef (how many template placeholders map to it)
  const allMappings = templateDocIds.length > 0
    ? await db.query.templatePlaceholderMapping.findMany({
        where: inArray(templatePlaceholderMapping.templateDocumentId, templateDocIds),
      })
    : [];

  const mappingCountByDefId = new Map<string, { count: number; templates: string[] }>();
  for (const m of allMappings) {
    const existing = mappingCountByDefId.get(m.elementDefId) || { count: 0, templates: [] };
    existing.count++;
    const tmplName = docNameMap.get(m.templateDocumentId)?.name;
    if (tmplName && !existing.templates.includes(tmplName)) existing.templates.push(tmplName);
    mappingCountByDefId.set(m.elementDefId, existing);
  }

  const enrichedElements = combinedElementDefs.map(ed => ({
    ...ed,
    sourceDocument: ed.guideDocumentId ? docNameMap.get(ed.guideDocumentId) : null,
    mappingCount: mappingCountByDefId.get(ed.id)?.count || 0,
    mappedTemplates: mappingCountByDefId.get(ed.id)?.templates || [],
  }));

  // === 4. REFERENCE TABLES ===
  const allTables = guideDocIds.length > 0
    ? await db.query.guideReferenceTables.findMany({
        where: and(inArray(guideReferenceTables.documentId, guideDocIds), eq(guideReferenceTables.organizationId, auth.organizationId)),
      })
    : [];

  const enrichedTables = allTables.map(t => ({
    ...t,
    sourceDocument: docNameMap.get(t.documentId) || null,
    rowCount: Array.isArray(t.data) ? t.data.length : 0,
    columnCount: Array.isArray(t.schema) ? t.schema.length : 0,
  }));

  // === 5. SESSION CHECKLIST ===
  const checklistItems = await db.query.sessionChecklist.findMany({
    where: and(eq(sessionChecklist.folderId, folderId), eq(sessionChecklist.organizationId, auth.organizationId)),
    orderBy: (c, { asc: a }) => [a(c.category), a(c.sortOrder)],
  });

  // Enrich checklist with template names
  const enrichedChecklist = checklistItems.map(item => ({
    ...item,
    templateName: item.templateId ? docNameMap.get(item.templateId)?.name || null : null,
  }));

  // === Build category counts for rules ===
  const ruleCategoryCounts: Record<string, number> = {};
  for (const r of allRules) {
    const cat = r.category || "other";
    ruleCategoryCounts[cat] = (ruleCategoryCounts[cat] || 0) + 1;
  }

  return c.json({
    sessionName: folder.name,
    rules: {
      items: enrichedRules,
      total: enrichedRules.length,
      fixed: enrichedRules.filter(r => r.type === "fixed").length,
      interpreted: enrichedRules.filter(r => r.type === "interpreted").length,
      categories: ruleCategoryCounts,
    },
    scoring: {
      items: enrichedScoring,
      total: enrichedScoring.length,
    },
    elements: {
      items: enrichedElements,
      total: enrichedElements.length,
      mapped: enrichedElements.filter(e => (mappingCountByDefId.get(e.id)?.count || 0) > 0).length,
      unmapped: enrichedElements.filter(e => (mappingCountByDefId.get(e.id)?.count || 0) === 0).length,
    },
    tables: {
      items: enrichedTables,
      total: enrichedTables.length,
    },
    checklist: {
      items: enrichedChecklist,
      total: enrichedChecklist.length,
      categories: Object.fromEntries(
        [...new Set(enrichedChecklist.map(c => c.category))].map(cat => [cat, enrichedChecklist.filter(c => c.category === cat).length])
      ),
    },
  });
});

// --- SESSION CHECKLIST CRUD ---

const createSessionChecklistSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().default("General"),
  notes: z.string().optional(),
});

documentRoutes.post("/session/:folderId/checklist", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { folderId } = c.req.param();
  const body = createSessionChecklistSchema.parse(await c.req.json());

  const [item] = await db.insert(sessionChecklist).values({
    folderId,
    organizationId: auth.organizationId,
    name: body.name,
    category: body.category || "General",
    source: "manual",
    notes: body.notes || null,
  }).returning();

  return c.json(item, 201);
});

const updateSessionChecklistSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  templateId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

documentRoutes.put("/session/:folderId/checklist/:itemId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { itemId } = c.req.param();
  const body = updateSessionChecklistSchema.parse(await c.req.json());

  const updateData: Record<string, any> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.templateId !== undefined) updateData.templateId = body.templateId;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

  const [updated] = await db.update(sessionChecklist).set(updateData)
    .where(and(eq(sessionChecklist.id, itemId), eq(sessionChecklist.organizationId, auth.organizationId)))
    .returning();

  return c.json(updated);
});

documentRoutes.delete("/session/:folderId/checklist/:itemId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { itemId } = c.req.param();

  await db.delete(sessionChecklist)
    .where(and(eq(sessionChecklist.id, itemId), eq(sessionChecklist.organizationId, auth.organizationId)));

  return c.json({ ok: true });
});

// --- Auto-populate session checklist from guide rules ---
documentRoutes.post("/session/:folderId/checklist/auto-populate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { folderId } = c.req.param();

  // Get guide docs in this session
  const guideFolders = await db.query.documentFolders.findMany({
    where: and(eq(documentFolders.parentId, folderId), eq(documentFolders.type, "ghiduri")),
  });

  const allRules: any[] = [];
  for (const gf of guideFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, gf.id),
    });
    for (const doc of docs) {
      const docRules = await db.query.rules.findMany({
        where: eq(rules.documentId, doc.id),
      });
      allRules.push(...docRules);
    }
  }

  // Filter for document-related rules
  const docRules = allRules.filter(r =>
    r.category === "documente" || r.category === "documentare" || r.category === "documente_necesare"
    || r.description?.toLowerCase().includes("document")
    || r.description?.toLowerCase().includes("acte necesare")
    || r.description?.toLowerCase().includes("anexe")
    || r.description?.toLowerCase().includes("ofert")
  );

  // Check existing items to avoid duplicates
  const existing = await db.query.sessionChecklist.findMany({
    where: and(eq(sessionChecklist.folderId, folderId), eq(sessionChecklist.organizationId, auth.organizationId)),
  });
  const existingRuleIds = new Set(existing.filter(e => e.sourceRuleId).map(e => e.sourceRuleId));

  // Helper: extract quantity from rule description (e.g., "3 oferte" → 3, "minimum 2 surse" → 2)
  function extractCardinality(description: string): number | null {
    const patterns = [
      /(\d+)\s*oferte/i,
      /(\d+)\s*surse/i,
      /minim(?:um)?\s*(\d+)/i,
      /cel\s*pu[tț]in\s*(\d+)/i,
      /(\d+)\s*exemplare/i,
      /(\d+)\s*copii/i,
    ];
    for (const pat of patterns) {
      const m = description.match(pat);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > 1 && n <= 20) return n;
      }
    }
    return null;
  }

  const newItems = docRules
    .filter(r => !existingRuleIds.has(r.id))
    .map((r, idx) => {
      const desc = (r.description || "").toLowerCase();
      let category = "Documente juridice";
      if (desc.includes("bilanț") || desc.includes("financiar") || desc.includes("buget") || desc.includes("contabil")) {
        category = "Documente financiare";
      } else if (desc.includes("tehnic") || desc.includes("fezabilitate") || desc.includes("memoriu")) {
        category = "Documente tehnice";
      } else if (desc.includes("declarați") || desc.includes("angajament") || desc.includes("acord")) {
        category = "Declarații & Angajamente";
      } else if (desc.includes("ofert")) {
        category = "Documente achizitii";
      }
      const cardinality = extractCardinality(r.description || "");
      return {
        folderId,
        organizationId: auth.organizationId!,
        name: r.description,
        category,
        source: "ghid" as const,
        sourceRuleId: r.id,
        sortOrder: existing.length + idx,
        notes: cardinality ? `Necesar: ${cardinality} instanțe` : null,
      };
    });

  if (newItems.length > 0) {
    await db.insert(sessionChecklist).values(newItems);
  }

  return c.json({ added: newItems.length, total: existing.length + newItems.length });
});

// --- VALIDATE / CORRECT TEMPLATE PLACEHOLDER MAPPING ---
const validateMappingSchema = z.object({
  elementDefId: z.string().uuid().optional(),  // if provided, changes the mapped elementDef
  validated: z.boolean(),
});

documentRoutes.put("/documents/:docId/mappings/:mappingId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { docId, mappingId } = c.req.param();

  const body = validateMappingSchema.parse(await c.req.json());

  // Verify document belongs to org
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  // Get existing mapping
  const mapping = await db.query.templatePlaceholderMapping.findFirst({
    where: and(
      eq(templatePlaceholderMapping.id, mappingId),
      eq(templatePlaceholderMapping.templateDocumentId, docId),
    ),
  });
  if (!mapping) return c.json({ error: "Mapping not found" }, 404);

  const updateData: Record<string, any> = {
    validated: body.validated,
    validatedBy: body.validated ? auth.userId : null,
    validatedAt: body.validated ? new Date() : null,
  };

  // If correcting the mapped elementDef
  if (body.elementDefId && body.elementDefId !== mapping.elementDefId) {
    // Verify elementDef exists and belongs to org
    const elemDef = await db.query.elementDefinitions.findFirst({
      where: and(
        eq(elementDefinitions.id, body.elementDefId),
        eq(elementDefinitions.organizationId, auth.organizationId),
      ),
    });
    if (!elemDef) return c.json({ error: "Element definition not found" }, 404);

    updateData.elementDefId = body.elementDefId;
    updateData.mappedBy = "manual";
    updateData.confidence = "1.00";
  }

  const [updated] = await db.update(templatePlaceholderMapping)
    .set(updateData)
    .where(eq(templatePlaceholderMapping.id, mappingId))
    .returning();

  return c.json(updated);
});

// --- CREATE TEMPLATE PLACEHOLDER MAPPING (for unmapped placeholders) ---
const createMappingSchema = z.object({
  placeholderKey: z.string().min(1),
  elementDefId: z.string().uuid(),
});

documentRoutes.post("/documents/:docId/mappings", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const { docId } = c.req.param();

  const body = createMappingSchema.parse(await c.req.json());

  // Verify document belongs to org
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  // Verify elementDef belongs to org
  const elemDef = await db.query.elementDefinitions.findFirst({
    where: and(
      eq(elementDefinitions.id, body.elementDefId),
      eq(elementDefinitions.organizationId, auth.organizationId),
    ),
  });
  if (!elemDef) return c.json({ error: "Element definition not found" }, 404);

  const [created] = await db.insert(templatePlaceholderMapping).values({
    templateDocumentId: docId,
    placeholderKey: body.placeholderKey,
    elementDefId: body.elementDefId,
    mappedBy: "manual",
    confidence: "1.00",
    validated: true,
    validatedBy: auth.userId,
    validatedAt: new Date(),
  }).returning();

  return c.json(created, 201);
});

// --- SSE: subscribe to upload events for organization ---
documentRoutes.get("/uploads/events", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const { redis: subRedis } = await import("../lib/redis");
  const subscriber = subRedis.duplicate();
  const channel = `org:${auth.organizationId}:uploads`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); } catch { /* closed */ }
      };

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => send('{"event":"heartbeat"}'), 30_000);

      await subscriber.subscribe(channel);
      subscriber.on("message", (_ch: string, message: string) => send(message));

      // Cleanup on close
      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe(channel).catch((e: any) => console.warn("[documents] redis unsubscribe:", e.message));
        subscriber.disconnect();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
