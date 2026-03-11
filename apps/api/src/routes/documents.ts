import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { documentFolders, documents, templateElements } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { uploadFile, getFileUrl, deleteFile } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processGuideQueue, processTemplateQueue, processReferenceDataQueue } from "../lib/queue";

export const documentRoutes = new Hono<AppEnv>();

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

// --- UPLOAD DOCUMENT ---
documentRoutes.post("/folders/:folderId/documents", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const folderId = c.req.param("folderId");

  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, folderId), eq(documentFolders.organizationId, auth.organizationId!)),
  });
  if (!folder) return c.json({ error: "Folder not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const tags = (formData.get("tags") as string || "").split(",").filter(Boolean);

  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const fileType = ext === "pdf" ? "pdf" : ext === "xlsx" || ext === "xls" ? "xlsx" : ext === "doc" ? "doc" : "docx";

  // Check for explicit processingType from form data (allows sub-classification in ghiduri folder)
  const explicitType = formData.get("processingType") as string | null;

  let processingType: string;
  if (explicitType === "reference_data" && folder.type === "ghiduri") {
    processingType = "reference_data";
  } else if (folder.type === "ghiduri") {
    processingType = "ghid";
  } else if (folder.type === "templateuri") {
    processingType = "template";
  } else {
    processingType = "reference";
  }

  const [doc] = await db.insert(documents).values({
    folderId,
    organizationId: auth.organizationId!,
    name: file.name.replace(/\.[^.]+$/, ""),
    fileType: fileType as any,
    fileId,
    fileSize: buffer.length,
    status: "uploaded",
    processingType: processingType as any,
    tags,
    uploadedBy: auth.userId,
  }).returning();

  // Auto-process guides, templates, and reference data
  if (processingType === "ghid") {
    await processGuideQueue.add("process-guide", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  } else if (processingType === "template") {
    await processTemplateQueue.add("process-template", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  } else if (processingType === "reference_data") {
    await processReferenceDataQueue.add("process-reference-data", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  }

  return c.json(doc, 201);
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

  await db.update(documents).set({ status: "processing" }).where(eq(documents.id, id));

  if (doc.processingType === "ghid") {
    await processGuideQueue.add("process-guide", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
  } else if (doc.processingType === "template") {
    await processTemplateQueue.add("process-template", {
      documentId: doc.id,
      organizationId: auth.organizationId!,
    });
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
