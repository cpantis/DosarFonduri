import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { createHash } from "crypto";
import { db } from "../db";
import { documentFolders, documents, files, templateElements } from "../db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { uploadFile, getFileUrl, deleteFile, createPresignedUploadUrl, verifyFileUploaded, isLocalStorage } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processGuideQueue, processTemplateQueue, processReferenceDataQueue, processClientDocQueue, JOB_PRIORITY } from "../lib/queue";
import { publishUploadEvent } from "../lib/sse";

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

  // Delete R2 files for all documents in this folder (and sub-folders recursively)
  async function deleteFilesInFolder(folderId: string) {
    const docs = await db.query.documents.findMany({
      where: and(eq(documents.folderId, folderId), eq(documents.organizationId, auth.organizationId!)),
    });
    for (const doc of docs) {
      await deleteFile(doc.fileId).catch(() => {});
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

  return c.json(docs);
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
  try {
    const jobPayload = { documentId: doc.id, organizationId: auth.organizationId };
    let dispatched = false;
    if (doc.processingType === "ghid") {
      await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE });
      dispatched = true;
    } else if (doc.processingType === "template") {
      await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE });
      dispatched = true;
    } else if (doc.processingType === "reference_data") {
      await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA });
      dispatched = true;
    } else if (doc.processingType === "client_doc") {
      await processClientDocQueue.add("process-client-doc", jobPayload, { priority: JOB_PRIORITY.CLIENT_DOC });
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

  // SSE notification
  publishUploadEvent(auth.organizationId, {
    documentId: doc.id,
    documentName: doc.name,
    status: "processing",
    processingType: doc.processingType || "reference",
    message: `Document uploadat "${doc.name}", procesare în curs...`,
  }).catch(() => {});

  return c.json({ ok: true, document_id: doc.id, actual_size: size, warnings: warnings.length > 0 ? warnings : undefined });
});

// --- LOCAL UPLOAD (dev fallback when S3 is not configured) ---
// Handles the PUT request from the frontend when presigned URL points to local API
documentRoutes.put("/local-upload/:fileId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
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
  try {
    const jobPayload = { documentId: doc.id, organizationId: auth.organizationId! };
    let dispatched = false;
    if (processingType === "ghid") {
      await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE });
      dispatched = true;
    } else if (processingType === "template") {
      await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE });
      dispatched = true;
    } else if (processingType === "reference_data") {
      await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA });
      dispatched = true;
    } else if (processingType === "client_doc") {
      await processClientDocQueue.add("process-client-doc", jobPayload, { priority: JOB_PRIORITY.CLIENT_DOC });
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

  // --- SSE notification ---
  publishUploadEvent(auth.organizationId!, {
    documentId: doc.id,
    documentName: safeName,
    status: doc.status,
    processingType,
    message: `Document uploadat "${safeName}", procesare în curs...`,
  }).catch(() => {}); // fire and forget

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

  await deleteFile(doc.fileId);
  await db.delete(documents).where(eq(documents.id, id));

  return c.json({ ok: true });
});

// --- MANUAL PROCESS ---
documentRoutes.post("/documents/:id/process", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not found" }, 404);

  // Only dispatch types that have a processing queue
  const dispatchableTypes = ["ghid", "template", "reference_data", "client_doc"];
  if (!dispatchableTypes.includes(doc.processingType || "")) {
    return c.json({ error: `Tipul "${doc.processingType}" nu necesită procesare AI.` }, 400);
  }

  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, id));

  try {
    const jobPayload = { documentId: doc.id, organizationId: auth.organizationId! };
    if (doc.processingType === "ghid") {
      await processGuideQueue.add("process-guide", jobPayload, { priority: JOB_PRIORITY.GUIDE });
    } else if (doc.processingType === "template") {
      await processTemplateQueue.add("process-template", jobPayload, { priority: JOB_PRIORITY.TEMPLATE });
    } else if (doc.processingType === "reference_data") {
      await processReferenceDataQueue.add("process-reference-data", jobPayload, { priority: JOB_PRIORITY.REFERENCE_DATA });
    } else if (doc.processingType === "client_doc") {
      await processClientDocQueue.add("process-client-doc", jobPayload, { priority: JOB_PRIORITY.CLIENT_DOC });
    }
  } catch (queueErr: any) {
    console.error(`Queue dispatch failed for document ${doc.id}:`, queueErr.message);
    await db.update(documents).set({ status: "uploaded" }).where(eq(documents.id, id));
    return c.json({ error: "Procesarea nu a pornit — Redis indisponibil. Reîncearcă mai târziu." }, 503);
  }

  return c.json({ ok: true, message: "Procesare pornită" });
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
  const body = await c.req.json();

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
  const { pageNum, validated } = await c.req.json();

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
  const body = await c.req.json();

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  const [el] = await db.insert(templateElements).values({
    documentId: docId,
    organizationId: auth.organizationId!,
    key: body.key,
    label: body.label,
    fieldType: body.fieldType || "text",
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
  const { docId, elId } = c.req.param() as { docId: string; elId: string };

  await db.delete(templateElements).where(
    and(eq(templateElements.id, elId), eq(templateElements.documentId, docId))
  );

  return c.json({ ok: true });
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
        subscriber.unsubscribe(channel).catch(() => {});
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
