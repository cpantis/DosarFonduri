import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { files } from "../db/schema";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import type { Readable } from "stream";

if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
  console.warn("S3_ACCESS_KEY or S3_SECRET_KEY not set — file storage will not work.");
}

const s3 = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || "dosarfonduri";

function extractExtension(originalName: string): string {
  const dotIndex = originalName.lastIndexOf(".");
  if (dotIndex < 1) return "bin"; // no extension or dotfile like ".gitignore"
  return originalName.slice(dotIndex + 1) || "bin";
}

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

export async function getFileUrl(fileId: string, organizationId?: string): Promise<string> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) throw new Error("File not found");

  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }), { expiresIn: 900 });

  return url;
}

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

/**
 * Stream a file from R2/S3 without loading it entirely into memory.
 * Returns a Node.js Readable stream — suitable for piping to child processes
 * (e.g. PyMuPDF via stdin) or streaming HTTP responses.
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

  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }));

  // AWS SDK v3 Body is a web ReadableStream in some envs; convert to Node Readable
  const body = response.Body;
  if (!body) throw new Error("Empty response body from S3");

  let stream: Readable;
  if ("pipe" in body && typeof (body as any).pipe === "function") {
    // Already a Node.js Readable
    stream = body as unknown as Readable;
  } else {
    // Web ReadableStream — convert
    const { Readable: NodeReadable } = await import("stream");
    stream = NodeReadable.fromWeb(body as any);
  }

  return {
    stream,
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
  };
}

/**
 * Get a file as either buffer (small) or stream (large) based on size threshold.
 * Callers that can handle both should use this for optimal memory usage.
 */
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

/**
 * Create a presigned URL for direct upload to R2/S3.
 * Returns the presigned URL, the generated storage key, and the file DB record ID.
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

  // Create DB record in "pending" state — will be confirmed after upload
  const [file] = await db.insert(files).values({
    storageKey: key,
    originalName,
    mimeType,
    size: sizeBytes,
    organizationId,
    uploadedBy,
  }).returning();

  return { presignedUrl, fileId: file.id, storageKey: key, expiresIn };
}

/**
 * Verify that a file was actually uploaded to R2/S3 by checking if the object exists.
 */
export async function verifyFileUploaded(storageKey: string): Promise<{ exists: boolean; size: number }> {
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

export async function deleteFile(fileId: string, organizationId?: string): Promise<void> {
  const conditions = [eq(files.id, fileId)];
  if (organizationId) {
    conditions.push(eq(files.organizationId, organizationId));
  }

  const file = await db.query.files.findFirst({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });
  if (!file) return;

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }));

  await db.delete(files).where(eq(files.id, fileId));
}
