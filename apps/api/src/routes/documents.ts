import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { documentFolders, documents } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { uploadFile, getFileUrl, deleteFile } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processGuideQueue, processTemplateQueue } from "../lib/queue";

export const documentRoutes = new Hono();

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

  const processingType = folder.type === "ghiduri" ? "ghid"
    : folder.type === "templateuri" ? "template"
    : "reference";

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

  // Auto-process guides and templates
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
