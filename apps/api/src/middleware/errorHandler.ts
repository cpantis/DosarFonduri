import type { Context } from "hono";

export const errorHandler = (err: Error, c: Context) => {
  console.error("Unhandled error:", err);

  if (err.name === "ZodError") {
    return c.json({ error: "Date invalide", details: (err as any).issues }, 400);
  }

  if (err.message.includes("not found") || err.message.includes("Not found")) {
    return c.json({ error: "Resursa nu a fost găsită" }, 404);
  }

  return c.json({ error: "Eroare internă" }, 500);
};
