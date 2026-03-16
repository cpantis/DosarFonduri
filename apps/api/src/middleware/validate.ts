import type { Context, Next } from "hono";
import { z, type ZodSchema } from "zod";

/**
 * Hono middleware that validates request JSON body against a Zod schema.
 * On success, stores parsed data in context as "validatedBody".
 * On failure, returns 400 with structured error details.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      const flat = result.error.flatten();
      return c.json({
        error: "Validation failed",
        details: flat.fieldErrors,
        formErrors: flat.formErrors,
      }, 400);
    }

    c.set("validatedBody", result.data);
    await next();
  };
}
