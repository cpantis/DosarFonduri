/**
 * Document Version Upgrade — cascade logic for when a new version replaces an old one.
 *
 * Flow:
 * 1. Archive old document (isCurrentVersion=false)
 * 2. Set new document as current (isCurrentVersion=true, version++)
 * 3. Save version diff on new document
 * 4. Delete old chunks + trigger re-ingestion of new doc
 * 5. Re-extract FormSpec if template_fill
 * 6. Mark composeBrief outdated if critical changes
 * 7. Emit SSE event
 */
import { db } from "../db";
import { documents, chunks, projects, formSpecs } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateVersionDiff, type VersionDiffResult } from "./versionDiff";
import { getFileBuffer } from "./storage";
import { extractTextFromPDF, extractTextFromDOCX } from "./ocr";
import { ingestDocumentQueue, JOB_PRIORITY } from "../lib/queue";
import { isRedisReady } from "../lib/redis";
import { publishEvent } from "../lib/sse";

export interface VersionUpgradeReport {
  chunksDeleted: number;
  formSpecReExtracted: boolean;
  composeBriefInvalidated: boolean;
  solomonNotified: boolean;
  diff: VersionDiffResult;
}

export async function executeVersionUpgrade(
  oldDocId: string,
  newDocId: string,
  organizationId: string,
): Promise<VersionUpgradeReport> {
  const report: VersionUpgradeReport = {
    chunksDeleted: 0,
    formSpecReExtracted: false,
    composeBriefInvalidated: false,
    solomonNotified: false,
    diff: { summary: "", changes: [], confidence: 0, analyzedAt: new Date().toISOString() },
  };

  // Load both documents
  const oldDoc = await db.query.documents.findFirst({ where: eq(documents.id, oldDocId) });
  const newDoc = await db.query.documents.findFirst({ where: eq(documents.id, newDocId) });
  if (!oldDoc || !newDoc) throw new Error("Document not found");

  // Get old version number
  const oldVersion = oldDoc.documentVersion || 1;

  // Generate version diff
  try {
    const oldBuffer = await getFileBuffer(oldDoc.fileId);
    const newBuffer = await getFileBuffer(newDoc.fileId);

    const oldText = oldDoc.fileType === "pdf"
      ? (await extractTextFromPDF(oldBuffer.buffer)).text
      : await extractTextFromDOCX(oldBuffer.buffer, oldBuffer.name);
    const newText = newDoc.fileType === "pdf"
      ? (await extractTextFromPDF(newBuffer.buffer)).text
      : await extractTextFromDOCX(newBuffer.buffer, newBuffer.name);

    report.diff = await generateVersionDiff(oldText, newText, (oldDoc.classification as any)?.docType || "ghid");
  } catch (err) {
    console.warn("[versionUpgrade] Diff generation failed:", (err as Error).message);
  }

  // 1. Archive old document
  await db.update(documents).set({
    isCurrentVersion: false,
    supersededBy: newDocId,
    archivedAt: new Date(),
  }).where(eq(documents.id, oldDocId));

  // 2. Set new document as current
  await db.update(documents).set({
    isCurrentVersion: true,
    supersedes: oldDocId,
    documentVersion: oldVersion + 1,
    versionDiff: report.diff as any,
  }).where(eq(documents.id, newDocId));

  // 3. Delete old chunks
  const deleted = await db.delete(chunks).where(eq(chunks.documentId, oldDocId)).returning();
  report.chunksDeleted = deleted.length;

  // 4. Trigger re-ingestion of new document
  if (isRedisReady()) {
    try {
      await ingestDocumentQueue.add("ingest-document", {
        documentId: newDocId,
        cabinetId: organizationId,
        sessionId: newDoc.folderId,
        organizationId,
      }, {
        priority: JOB_PRIORITY.INGEST,
        jobId: `upgrade-${newDocId}`,
      });
    } catch {}
  }

  // 5. Re-extract FormSpec if template_fill
  const newClassification = newDoc.classification as any;
  if (newClassification?.routingAction === "template_fill") {
    try {
      await db.update(formSpecs).set({ isActive: false }).where(eq(formSpecs.documentId, oldDocId));
      report.formSpecReExtracted = true;
    } catch {}
  }

  // 6. Mark composeBrief outdated if critical changes
  const hasCritical = report.diff.changes.some(c => c.severity === "critical" || c.severity === "important");
  if (hasCritical) {
    // Find projects using this folder
    const proj = await db.query.projects.findFirst({
      where: eq(projects.folderId, newDoc.folderId),
    });
    if (proj && (proj as any).composeBrief) {
      const brief = (proj as any).composeBrief as any;
      brief._outdated = true;
      brief._outdatedReason = report.diff.summary;
      await db.update(projects).set({ composeBrief: brief }).where(eq(projects.id, proj.id));
      report.composeBriefInvalidated = true;
    }
  }

  // 7. Emit SSE event
  publishEvent(`org:${organizationId}:uploads`, "version_upgrade", {
    oldDocId,
    newDocId,
    oldVersion,
    newVersion: oldVersion + 1,
    diff: report.diff,
  }).catch(() => {});
  report.solomonNotified = true;

  return report;
}
