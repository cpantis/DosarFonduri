import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { files } from "../db/schema";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import type { Readable } from "stream";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, statSync, createReadStream } from "fs";
import { join, dirname } from "path";

// ─── Storage mode: S3 (production) or local filesystem (dev fallback) ───

const USE_S3 = !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && process.env.S3_ENDPOINT);

if (!USE_S3) {
  console.warn("⚠️  S3 not configured (S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT missing).");
  console.warn("   Using LOCAL filesystem storage at ./uploads/. Not suitable for production.");
}

const LOCAL_STORAGE_ROOT = join(process.cwd(), "uploads");

const s3 = USE_S3
  ? new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      },
      forcePathStyle: true,
    })
  : null;

const BUCKET = process.env.S3_BUCKET || "dosarfonduri";

function extractExtension(originalName: string): string {
  const dotIndex = originalName.lastIndexOf(".");
  if (dotIndex < 1) return "bin"; // no extension or dotfile like ".gitignore"
  return originalName.slice(dotIndex + 1) || "bin";
}

// ─── Local filesystem helpers ───────────────────────────

function localPath(key: string): string {
  return join(LOCAL_STORAGE_ROOT, key);
}

function localWrite(key: string, buffer: Buffer): void {
  const fullPath = localPath(key);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, buffer);
}

function localRead(key: string): Buffer {
  return readFileSync(localPath(key));
}

function localDelete(key: string): void {
  const fullPath = localPath(key);
  if (existsSync(fullPath)) unlinkSync(fullPath);
}

function localExists(key: string): { exists: boolean; size: number } {
  const fullPath = localPath(key);
  if (!existsSync(fullPath)) return { exists: false, size: 0 };
  const stat = statSync(fullPath);
  return { exists: true, size: stat.size };
}

// ─── Upload ─────────────────────────────────────────────

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  organizationId: string,
  uploadedBy: string,
  uploadContext?: string,
): Promise<string> {
  const ext = extractExtension(originalName);
  const ctx = uploadContext || "uploads";
  const key = `${organizationId}/${ctx}/${uuid()}.${ext}`;

  if (USE_S3 && s3) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        "original-filename": encodeURIComponent(originalName),
        "upload-context": ctx,
        "uploaded-by": uploadedBy,
      },
    }));
  } else {
    localWrite(key, buffer);
  }

  const [file] = await db.insert(files).values({
    storageKey: key,
    originalName,
    mimeType,
    size: buffer.length,
    organizationId,
    uploadedBy,
  }).returning();

  return file.id;
}

// ─── Get File URL ───────────────────────────────────────

export async function getFileUrl(fileId: string, organizationId?: string): Promise<string> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) throw new Error("File not found");

  if (USE_S3 && s3) {
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: BUCKET,
      Key: file.storageKey,
    }), { expiresIn: 900 });
    return url;
  }

  // Local: return a path-based URL that the API can serve
  return `/api/documents/files/${fileId}/download`;
}

// ─── Get File Buffer ────────────────────────────────────

/** Threshold above which we prefer streaming over buffering (10 MB) */
const STREAM_THRESHOLD = 10 * 1024 * 1024;

export async function getFileBuffer(fileId: string, organizationId?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) throw new Error("File not found");

  // For files > 10 MB, warn — callers should use getFileStream instead
  if (file.size > STREAM_THRESHOLD) {
    console.warn(`getFileBuffer called for large file (${Math.round(file.size / 1024 / 1024)} MB). Consider using getFileStream() instead.`);
  }

  if (USE_S3 && s3) {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: file.storageKey,
    }));

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) chunks.push(chunk);
    return {
      buffer: Buffer.concat(chunks),
      name: file.originalName,
      mimeType: file.mimeType,
    };
  }

  // Local filesystem
  const buffer = localRead(file.storageKey);
  return { buffer, name: file.originalName, mimeType: file.mimeType };
}

// ─── Get File Stream ────────────────────────────────────

/**
 * Stream a file from R2/S3 or local filesystem without loading it entirely into memory.
 */
export async function getFileStream(fileId: string, organizationId?: string): Promise<{
  stream: Readable;
  name: string;
  mimeType: string;
  size: number;
}> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) throw new Error("File not found");

  if (USE_S3 && s3) {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: file.storageKey,
    }));

    // AWS SDK v3 Body is a web ReadableStream in some envs; convert to Node Readable
    const body = response.Body;
    if (!body) throw new Error("Empty response body from S3");

    let stream: Readable;
    if ("pipe" in body && typeof (body as any).pipe === "function") {
      stream = body as unknown as Readable;
    } else {
      const { Readable: NodeReadable } = await import("stream");
      stream = NodeReadable.fromWeb(body as any);
    }

    return { stream, name: file.originalName, mimeType: file.mimeType, size: file.size };
  }

  // Local filesystem
  const stream = createReadStream(localPath(file.storageKey));
  return { stream, name: file.originalName, mimeType: file.mimeType, size: file.size };
}

// ─── Get File Auto (buffer or stream based on size) ─────

export async function getFileAuto(fileId: string, organizationId?: string): Promise<{
  buffer?: Buffer;
  stream?: Readable;
  name: string;
  mimeType: string;
  size: number;
}> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) throw new Error("File not found");

  if (file.size <= STREAM_THRESHOLD) {
    const { buffer } = await getFileBuffer(fileId, organizationId);
    return { buffer, name: file.originalName, mimeType: file.mimeType, size: file.size };
  }

  const { stream } = await getFileStream(fileId, organizationId);
  return { stream, name: file.originalName, mimeType: file.mimeType, size: file.size };
}

// ─── Presigned Upload URL ───────────────────────────────

/**
 * Create a presigned URL for direct upload to R2/S3.
 * For local dev: returns a local upload endpoint URL instead.
 */
export async function createPresignedUploadUrl(
  originalName: string,
  mimeType: string,
  sizeBytes: number,
  organizationId: string,
  uploadedBy: string,
  uploadContext?: string,
): Promise<{ presignedUrl: string; fileId: string; storageKey: string; expiresIn: number }> {
  const ext = extractExtension(originalName);
  const ctx = uploadContext || "uploads";
  const key = `${organizationId}/${ctx}/${uuid()}.${ext}`;
  const expiresIn = 3600; // 1 hour

  // Create DB record first (needed for both S3 and local paths)
  const [file] = await db.insert(files).values({
    storageKey: key,
    originalName,
    mimeType,
    size: sizeBytes,
    organizationId,
    uploadedBy,
  }).returning();

  if (USE_S3 && s3) {
    const presignedUrl = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType,
      Metadata: {
        "original-filename": encodeURIComponent(originalName),
        "upload-context": ctx,
        "uploaded-by": uploadedBy,
      },
    }), { expiresIn });

    return { presignedUrl, fileId: file.id, storageKey: key, expiresIn };
  }

  // Local dev: return a local upload endpoint that the API will handle
  // The frontend will PUT the file to this URL instead of S3
  const presignedUrl = `/api/documents/local-upload/${file.id}`;
  return { presignedUrl, fileId: file.id, storageKey: key, expiresIn };
}

// ─── Verify File Uploaded ───────────────────────────────

export async function verifyFileUploaded(storageKey: string): Promise<{ exists: boolean; size: number }> {
  if (USE_S3 && s3) {
    try {
      const head = await s3.send(new HeadObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
      }));
      return { exists: true, size: head.ContentLength || 0 };
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return { exists: false, size: 0 };
      }
      throw err;
    }
  }

  // Local filesystem
  return localExists(storageKey);
}

// ─── Delete File ────────────────────────────────────────

export async function deleteFile(fileId: string, organizationId?: string): Promise<void> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) return;

  if (USE_S3 && s3) {
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: file.storageKey,
    }));
  } else {
    localDelete(file.storageKey);
  }

  await db.delete(files).where(eq(files.id, fileId));
}

// ─── Export storage mode for other modules ──────────────

export const isLocalStorage = !USE_S3;
