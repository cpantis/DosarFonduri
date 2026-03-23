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
    return c.json({ error: "Eroare la autentificare", detail: err?.message }, 500);
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
  const { email } = await c.req.json();
  if (!email) return c.json({ invited: false });

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
  const { code } = await c.req.json();

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

  // Send reset email
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

  const emailResult = await sendEmail({
    organizationId: user.organizationId || "system",
    to: user.email,
    subject: "Resetare parola — DosarFonduri",
    html: `
      <h2>Resetare parola</h2>
      <p>Salut, <strong>${user.name}</strong>!</p>
      <p>Ai solicitat resetarea parolei. Apasa pe link-ul de mai jos:</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4d8bff;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Reseteaza parola</a></p>
      <p style="color:#64748b;font-size:13px;">Link-ul expira in 1 ora. Daca nu ai solicitat resetarea, ignora acest email.</p>
    `,
  });

  const emailSent = !!(emailResult && emailResult.sent);
  if (!emailSent) {
    console.warn("[forgot-password] Email not sent to", user.email, "reason:", emailResult?.reason, emailResult?.detail || "");
  }

  // Return resetUrl as fallback when email service is not configured (admin can share the link manually)
  return c.json({
    ok: true,
    emailSent,
    ...(!emailSent ? { resetUrl } : {}),
  });
});

// --- RESET PASSWORD ---
authRoutes.post("/reset-password", async (c) => {
  const { token, password } = z.object({
    token: z.string().min(1),
    password: z.string().min(6),
  }).parse(await c.req.json());

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetToken = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.tokenHash, tokenHash),
  });

  if (!resetToken) {
    return c.json({ error: "Link invalid sau expirat" }, 400);
  }

  if (resetToken.usedAt) {
    return c.json({ error: "Link-ul a fost deja folosit" }, 400);
  }

  if (new Date() > resetToken.expiresAt) {
    return c.json({ error: "Link-ul a expirat. Solicita un nou link de resetare." }, 400);
  }

  // Update password
  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, resetToken.userId));

  // Mark token as used
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));

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
