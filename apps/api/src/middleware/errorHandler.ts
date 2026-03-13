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

  return c.json({ error: "Eroare internă" }, 500);
};
