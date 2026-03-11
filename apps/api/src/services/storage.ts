import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { files } from "../db/schema";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";

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

export async function getFileBuffer(fileId: string, organizationId?: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
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

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) chunks.push(chunk);
  return {
    buffer: Buffer.concat(chunks),
    name: file.originalName,
    mimeType: file.mimeType,
  };
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
