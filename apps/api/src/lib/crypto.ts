import crypto from "crypto";

const ALGO = "aes-256-gcm";

/**
 * Lazy-initialize the encryption key to avoid crashing the server at import time.
 * If ENCRYPTION_KEY is not set, the server still starts (health checks work),
 * but encrypt/decrypt calls will throw a clear error at runtime.
 */
let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).");
  }

  _key = key;
  return _key;
}

// Warn at startup but don't crash — server must start for health checks
if (!process.env.ENCRYPTION_KEY) {
  console.warn("⚠️  ENCRYPTION_KEY not set — encrypt/decrypt will fail at runtime. Server will start anyway.");
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV per NIST SP 800-38D for AES-GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getKey();
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted text format: expected iv:authTag:ciphertext");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted text format: empty component(s)");
  }
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
