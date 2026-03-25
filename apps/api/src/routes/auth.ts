import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import { users, organizations, cabinetCodes, passwordResetTokens } from "../db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { AppEnv } from "../types/hono";
import { lookupCUI_ListaFirme } from "../services/listafirme";
import { sendEmail } from "../services/email";

export const authRoutes = new Hono<AppEnv>();

/** Strip sensitive fields before sending user to client */
function sanitizeUser(user: Record<string, any>) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// --- SIGNUP ---
const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  cui: z.string().optional(),
  companyName: z.string().optional(),
  cabinetCode: z.string().optional(),
});

authRoutes.post("/signup", async (c) => {
  const body = signupSchema.parse(await c.req.json());

  // Check email duplicate
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing && existing.status !== "invited") {
    return c.json({ error: "Email deja inregistrat" }, 400);
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  // Check if email is pre-registered (invited by admin)
  const preRegistered = await db.query.users.findFirst({
    where: and(eq(users.email, body.email), eq(users.status, "invited")),
  });

  if (preRegistered) {
    await db.update(users).set({
      name: body.name,
      passwordHash,
      status: "active",
    }).where(eq(users.id, preRegistered.id));

    const token = await sign({ sub: preRegistered.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
    return c.json({ token, user: sanitizeUser({ ...preRegistered, name: body.name, status: "active" }), hasOrganization: true });
  }

  if (body.cabinetCode) {
    // Flow: first user activates cabinet
    const code = await db.query.cabinetCodes.findFirst({
      where: eq(cabinetCodes.code, body.cabinetCode.toUpperCase()),
    });
    if (!code || code.organizationId) return c.json({ error: "Cod invalid sau deja folosit" }, 400);
    if (!code.isActive) return c.json({ error: "Cod dezactivat" }, 400);

    // CUI handshake: if the code is tied to a CUI, the signup CUI must match
    if (code.cui) {
      const signupCUI = body.cui?.replace(/\D/g, "") || "";
      if (signupCUI !== code.cui) {
        return c.json({
          error: `Codul este destinat firmei cu CUI ${code.cui}${code.companyName ? ` (${code.companyName})` : ""}. Introdu CUI-ul corect la pasul 2.`,
        }, 400);
      }
    }

    // Create organization + user + mark code as used — all in a single transaction
    const orgName = code.companyName || body.companyName || (body.name + " Cabinet");

    try {
      const result = await db.transaction(async (tx) => {
        const [org] = await tx.insert(organizations).values({
          name: orgName,
          code: code.code,
          plan: code.plan,
          maxUsers: code.maxUsers,
          trialEndsAt: new Date(Date.now() + code.trialDays * 86400000),
          status: (code.trialDays > 0 ? "trial" : "active") as "trial" | "active",
        }).returning();

        const [user] = await tx.insert(users).values({
          email: body.email,
          name: body.name,
          passwordHash,
          organizationId: org.id,
          role: "admin",
          status: "active",
        }).returning();

        await tx.update(cabinetCodes).set({
          organizationId: org.id,
          activatedAt: new Date(),
        }).where(eq(cabinetCodes.id, code.id));

        return { org, user };
      });

      const token = await sign({ sub: result.user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
      return c.json({ token, user: sanitizeUser(result.user), organization: result.org, hasOrganization: true });
    } catch (err: any) {
      console.error("[signup] Transaction failed:", err.message);
      return c.json({ error: `Eroare la înregistrare: ${err.message}` }, 500);
    }
  }

  // Flow: signup without code -> pending
  const [user] = await db.insert(users).values({
    email: body.email,
    name: body.name,
    passwordHash,
    status: "pending_cabinet",
  }).returning();

  const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
  return c.json({ token, user: sanitizeUser(user), hasOrganization: false });
});

// --- LOGIN ---
authRoutes.post("/login", async (c) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(await c.req.json());

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return c.json({ error: "Email sau parola incorecta" }, 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return c.json({ error: "Email sau parola incorecta" }, 401);

    if (user.status === "disabled") return c.json({ error: "Cont dezactivat" }, 403);

    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

    const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
    return c.json({
      token,
      user: sanitizeUser(user),
      hasOrganization: !!user.organizationId,
    });
  } catch (err: any) {
    console.error("Login error:", err?.message, err?.stack);
    return c.json({ error: "Eroare la autentificare" }, 500);
  }
});

// --- ME ---
authRoutes.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });
    if (!user) return c.json({ error: "User not found" }, 404);

    let org = null;
    if (user.organizationId) {
      org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.organizationId),
      });
    }

    return c.json({ user: sanitizeUser(user), organization: org });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

// --- LOOKUP CUI (public, for signup step 2) ---
// Validates a CUI via listafirme.ro and returns basic company info.
// Rate-limited by design: only used during signup wizard.
authRoutes.post("/lookup-cui", async (c) => {
  const { cui } = z.object({ cui: z.string().min(1) }).parse(await c.req.json());

  const cleanCUI = String(cui).replace(/\D/g, "");
  if (cleanCUI.length < 6 || cleanCUI.length > 12) {
    return c.json({ found: false, error: "CUI trebuie sa aiba intre 6 si 12 cifre" });
  }

  try {
    const result = await lookupCUI_ListaFirme(cleanCUI);
    if (!result) {
      return c.json({ found: false, error: "CUI nu a fost gasit in baza de date" });
    }

    return c.json({
      found: true,
      company: {
        name: result.name,
        cui: result.taxCode,
        regNo: result.regNo,
        status: result.status,
        legalForm: result.legalForm,
        nace: result.nace,
        naceDescription: result.naceDescription,
        county: result.county,
        city: result.city,
        address: result.address,
        foundedDate: result.foundedDate,
        turnover: result.turnover,
        employees: result.employees,
      },
    });
  } catch (err: any) {
    console.error("CUI lookup error:", err?.message);
    return c.json({ found: false, error: "Eroare la verificarea CUI. Incearca mai tarziu." });
  }
});

// --- CHECK INVITED ---
authRoutes.post("/check-invited", async (c) => {
  let email: string;
  try {
    const body = z.object({ email: z.string().email() }).parse(await c.req.json());
    email = body.email;
  } catch {
    return c.json({ invited: false });
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email), eq(users.status, "invited")),
  });

  if (!user) return c.json({ invited: false });

  let orgName = "";
  if (user.organizationId) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });
    orgName = org?.name || "";
  }

  return c.json({ invited: true, organizationName: orgName, role: user.role });
});

// --- VALIDATE CODE ---
authRoutes.post("/validate-code", async (c) => {
  let code: string;
  try {
    const body = z.object({ code: z.string().min(1).max(50) }).parse(await c.req.json());
    code = body.code;
  } catch {
    return c.json({ valid: false, error: "Cod invalid" });
  }

  const cabinetCode = await db.query.cabinetCodes.findFirst({
    where: eq(cabinetCodes.code, code.toUpperCase()),
  });

  if (!cabinetCode || cabinetCode.organizationId) {
    return c.json({ valid: false, error: "Cod invalid sau deja folosit" });
  }
  if (!cabinetCode.isActive) {
    return c.json({ valid: false, error: "Cod dezactivat" });
  }

  return c.json({
    valid: true,
    plan: cabinetCode.plan,
    maxUsers: cabinetCode.maxUsers,
    trialDays: cabinetCode.trialDays,
    cui: cabinetCode.cui || null,
    companyName: cabinetCode.companyName || null,
  });
});

// --- FORGOT PASSWORD ---
authRoutes.post("/forgot-password", async (c) => {
  const { email } = z.object({ email: z.string().email() }).parse(await c.req.json());

  // Always return success to avoid email enumeration
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || user.status === "disabled") {
    return c.json({ ok: true });
  }

  try {
    // Ensure password_reset_tokens table exists (may not if migration hasn't run)
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "token_hash" varchar(64) NOT NULL,
      "expires_at" timestamp NOT NULL,
      "used_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`));
    await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "prt_token_hash_idx" ON "password_reset_tokens" ("token_hash")`));

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Invalidate any existing tokens for this user
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    // Store hashed token (expires in 1 hour)
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Send reset email via shared sendEmail service
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    const emailResult = await sendEmail({
      organizationId: user.organizationId || "system",
      to: user.email,
      subject: "Resetare parola — DosarFonduri",
      html: [
        `<div style="font-family:'DM Sans',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px">`,
        `<div style="background:linear-gradient(135deg,#4d8bff 0%,#34d399 100%);border-radius:12px;padding:24px 32px;margin-bottom:24px">`,
        `<h1 style="color:#fff;margin:0;font-size:22px">DosarFonduri</h1>`,
        `</div>`,
        `<h2 style="color:#1a1e28;margin:0 0 16px">Resetare parola</h2>`,
        `<p style="color:#5a6478;font-size:15px;line-height:1.6">`,
        `Salut, <strong>${user.name}</strong>!`,
        `</p>`,
        `<p style="color:#5a6478;font-size:15px;line-height:1.6">`,
        `Ai solicitat resetarea parolei. Apasa pe butonul de mai jos pentru a seta o parola noua:`,
        `</p>`,
        `<div style="text-align:center;margin:28px 0">`,
        `<a href="${resetUrl}" style="display:inline-block;padding:14px 36px;background:#4d8bff;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">Reseteaza parola</a>`,
        `</div>`,
        `<p style="color:#8892a8;font-size:13px;line-height:1.5">`,
        `Link-ul expira in 1 ora. Daca nu ai solicitat resetarea, ignora acest email.`,
        `</p>`,
        `<hr style="border:none;border-top:1px solid #e0e4ea;margin:24px 0"/>`,
        `<p style="color:#8892a8;font-size:12px">DosarFonduri &copy; ${new Date().getFullYear()}</p>`,
        `</div>`,
      ].join(""),
    });

    if (!emailResult.sent) {
      console.warn("[forgot-password] Email not sent to", user.email, "reason:", emailResult.reason, "resetUrl:", resetUrl);
    }

    return c.json({ ok: true, emailSent: emailResult.sent });
  } catch (err: any) {
    console.error("[forgot-password] Error:", err.message);
    // Always return ok:true to prevent email enumeration
    return c.json({ ok: true, emailSent: false });
  }
});

// --- RESET PASSWORD ---
authRoutes.post("/reset-password", async (c) => {
  const { token, password } = z.object({
    token: z.string().min(1),
    password: z.string().min(6),
  }).parse(await c.req.json());

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Use raw SQL to avoid Drizzle query builder issues if table doesn't exist in schema cache
  const rows = await db.execute(sql`
    SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
    WHERE token_hash = ${tokenHash} LIMIT 1
  `);
  const resetToken = (rows as any)?.[0] || (rows as any)?.rows?.[0];

  if (!resetToken) {
    return c.json({ error: "Link invalid sau expirat" }, 400);
  }

  if (resetToken.used_at) {
    return c.json({ error: "Link-ul a fost deja folosit" }, 400);
  }

  if (new Date() > new Date(resetToken.expires_at)) {
    return c.json({ error: "Link-ul a expirat. Solicita un nou link de resetare." }, 400);
  }

  // Update password
  const newPasswordHash = await bcrypt.hash(password, 12);
  await db.execute(sql`UPDATE users SET password_hash = ${newPasswordHash} WHERE id = ${resetToken.user_id}::uuid`);

  // Mark token as used
  await db.execute(sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${resetToken.id}::uuid`);

  return c.json({ ok: true });
});

// --- PREFERENCES ---
authRoutes.patch("/preferences", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    const { theme } = await c.req.json();

    if (theme && (theme === "dark" || theme === "light")) {
      await db.update(users).set({ theme }).where(eq(users.id, payload.sub as string));
    }

    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});
