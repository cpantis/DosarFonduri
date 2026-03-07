import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { files } from "../db/schema";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET || "dosarfonduri";

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  organizationId: string,
  uploadedBy: string,
): Promise<string> {
  const ext = originalName.split(".").pop() || "bin";
  const key = `${organizationId}/${uuid()}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
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

export async function getFileUrl(fileId: string): Promise<string> {
  const file = await db.query.files.findFirst({
    where: eq(files.id, fileId),
  });
  if (!file) throw new Error("File not found");

  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }), { expiresIn: 900 });

  return url;
}

export async function getFileBuffer(fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const file = await db.query.files.findFirst({
    where: eq(files.id, fileId),
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

export async function deleteFile(fileId: string): Promise<void> {
  const file = await db.query.files.findFirst({
    where: eq(files.id, fileId),
  });
  if (!file) return;

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: file.storageKey,
  }));

  await db.delete(files).where(eq(files.id, fileId));
}
