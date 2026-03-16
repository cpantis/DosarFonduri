import type { Context } from "hono";

export const errorHandler = (err: Error, c: Context) => {
  const method = c.req.method;
  const path = c.req.path;
  console.error(`[${method} ${path}] Unhandled error:`, err.message, err.stack);

  if (err.name === "ZodError") {
    console.error("ZodError details:", JSON.stringify((err as any).issues));
    return c.json({ error: "Date invalide", details: (err as any).issues }, 400);
  }

  if (err.message.includes("not found") || err.message.includes("Not found")) {
    return c.json({ error: "Resursa nu a fost găsită" }, 404);
  }

  // Multipart parsing errors
  if (err.message.includes("FormData") || err.message.includes("multipart") || err.message.includes("boundary")) {
    return c.json({ error: "Format incorect al fișierului. Asigură-te că fișierul este valid." }, 400);
  }

  // S3/storage errors
  if (err.message.includes("S3") || err.message.includes("NoSuchBucket") || err.message.includes("AccessDenied")) {
    console.error("Storage error — check S3 configuration");
    return c.json({ error: "Eroare la stocarea fișierului. Contactează administratorul." }, 500);
  }

  // Database connection errors
  if (err.message.includes("ECONNREFUSED") || err.message.includes("connection") || err.message.includes("timeout")) {
    return c.json({ error: "Eroare de conexiune la baza de date. Reîncearcă." }, 500);
  }

  // Column/schema errors (missing columns, wrong types)
  if (err.message.includes("column") || err.message.includes("relation") || err.message.includes("does not exist")) {
    console.error("Schema error — run migrations:", err.message);
    return c.json({ error: `Eroare schemă DB: ${err.message.substring(0, 150)}` }, 500);
  }

  // In production, include sanitized error category for debugging
  const isProduction = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT;
  if (isProduction) {
    // Include first 100 chars of error message — enough for debugging without leaking secrets
    const hint = err.message ? err.message.substring(0, 100) : "unknown";
    return c.json({ error: `Eroare internă. Contactează administratorul dacă problema persistă. [${hint}]` }, 500);
  }

  // In development, return the actual error message for debugging
  const msg = err.message || "Eroare internă";
  return c.json({ error: msg.length > 300 ? msg.substring(0, 300) : msg }, 500);
};
