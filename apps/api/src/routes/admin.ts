import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { users, organizations, projects, aiUsageLog, auditLog } from "../db/schema";
import { eq, and, sql, desc, count, sum, gte, lte, ilike } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";

// HTML escape to prevent XSS in email templates
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const adminRoutes = new Hono<AppEnv>();

// Helper: require admin role
const requireAdmin = async (c: any, next: any) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }
  await next();
};

adminRoutes.use("*", requireAdmin);

// ─── GET /users ───
adminRoutes.get("/users", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const orgUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      theme: users.theme,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      invitedBy: users.invitedBy,
    })
    .from(users)
    .where(eq(users.organizationId, auth.organizationId))
    .orderBy(users.createdAt);

  // Enrich with project count
  const enriched = await Promise.all(
    orgUsers.map(async (u) => {
      const [projectCount] = await db
        .select({ count: count() })
        .from(projects)
        .where(
          and(
            eq(projects.consultantId, u.id),
            eq(projects.organizationId, auth.organizationId!)
          )
        );
      return { ...u, projectCount: projectCount?.count || 0 };
    })
  );

  return c.json(enriched);
});

// ─── POST /users (invite) ───
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "consultant", "viewer"]),
  name: z.string().min(1).optional(),
});

adminRoutes.post("/users", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const body = inviteSchema.parse(await c.req.json());

  // Check org user limit
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId),
  });
  if (!org) return c.json({ error: "Organization not found" }, 404);

  const [{ count: currentCount }] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.organizationId, auth.organizationId));

  if (currentCount >= org.maxUsers) {
    return c.json({ error: `Limita de ${org.maxUsers} utilizatori atinsă` }, 400);
  }

  // Check email not already in use
  const existing = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });
  if (existing) {
    return c.json({ error: "Email deja utilizat" }, 400);
  }

  // Pre-register user (invited status, placeholder password)
  const [newUser] = await db
    .insert(users)
    .values({
      email: body.email,
      name: body.name || body.email.split("@")[0],
      passwordHash: "INVITED_NO_PASSWORD",
      organizationId: auth.organizationId,
      role: body.role,
      status: "invited",
      invitedBy: auth.userId,
    })
    .returning();

  // Send invitation email via Resend
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SENDER_EMAIL || "noreply@dosar-fonduri.com";
  if (apiKey) {
    const signupUrl = `${process.env.APP_URL || "https://app.dosarfonduri.ro"}/login?invited=1&email=${encodeURIComponent(body.email)}`;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `DosarFonduri <${from}>`,
          to: body.email,
          subject: `Ai fost invitat în cabinetul ${org.name} pe DosarFonduri`,
          html: [
            `<div style="font-family:'DM Sans',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px">`,
            `<div style="background:linear-gradient(135deg,#a78bfa 0%,#8b5cf6 100%);border-radius:12px;padding:24px 32px;margin-bottom:24px">`,
            `<h1 style="color:#fff;margin:0;font-size:22px">DosarFonduri</h1>`,
            `</div>`,
            `<h2 style="color:#1a1e28;margin:0 0 16px">Bine ai venit!</h2>`,
            `<p style="color:#5a6478;font-size:15px;line-height:1.6">`,
            `Ai fost invitat să te alături cabinetului <strong>${escapeHtml(org.name)}</strong> cu rolul de <strong>${escapeHtml(body.role)}</strong>.`,
            `</p>`,
            `<p style="color:#5a6478;font-size:15px;line-height:1.6">`,
            `Pentru a-ți activa contul, creează-ți un cont folosind adresa de email <strong>${escapeHtml(body.email)}</strong>:`,
            `</p>`,
            `<div style="text-align:center;margin:28px 0">`,
            `<a href="${signupUrl}" style="display:inline-block;padding:14px 36px;background:#a78bfa;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">Creează cont</a>`,
            `</div>`,
            `<p style="color:#8892a8;font-size:13px;line-height:1.5">`,
            `După înregistrare vei avea acces direct la cabinetul ${escapeHtml(org.name)} fără a fi nevoie de un cod de activare.`,
            `</p>`,
            `<hr style="border:none;border-top:1px solid #e0e4ea;margin:24px 0"/>`,
            `<p style="color:#8892a8;font-size:12px">DosarFonduri &copy; ${new Date().getFullYear()}</p>`,
            `</div>`,
          ].join(""),
        }),
      });
    } catch (emailErr: any) {
      console.warn("[admin/invite] Email send failed:", emailErr.message);
      // Don't fail the invite if email fails
    }
  }

  return c.json(newUser, 201);
});

// ─── POST /users/:id/resend-invite ───
adminRoutes.post("/users/:id/resend-invite", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.organizationId, auth.organizationId!)),
  });
  if (!user) return c.json({ error: "User not found" }, 404);
  if (user.status !== "invited") return c.json({ error: "Utilizatorul nu are status 'invitat'" }, 400);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId!),
  });
  if (!org) return c.json({ error: "Organization not found" }, 404);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SENDER_EMAIL || "noreply@dosar-fonduri.com";
  if (!apiKey) return c.json({ error: "Email service not configured" }, 503);

  const signupUrl = `${process.env.APP_URL || "https://app.dosarfonduri.ro"}/login?invited=1&email=${encodeURIComponent(user.email)}`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `DosarFonduri <${from}>`,
        to: user.email,
        subject: `Reminder: Ai fost invitat în cabinetul ${org.name} pe DosarFonduri`,
        html: [
          `<div style="font-family:'DM Sans',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px">`,
          `<div style="background:linear-gradient(135deg,#a78bfa 0%,#8b5cf6 100%);border-radius:12px;padding:24px 32px;margin-bottom:24px">`,
          `<h1 style="color:#fff;margin:0;font-size:22px">DosarFonduri</h1>`,
          `</div>`,
          `<h2 style="color:#1a1e28;margin:0 0 16px">Reminder invitație</h2>`,
          `<p style="color:#5a6478;font-size:15px;line-height:1.6">`,
          `Ai fost invitat să te alături cabinetului <strong>${escapeHtml(org.name)}</strong> cu rolul de <strong>${escapeHtml(user.role)}</strong>.`,
          `</p>`,
          `<div style="text-align:center;margin:28px 0">`,
          `<a href="${signupUrl}" style="display:inline-block;padding:14px 36px;background:#a78bfa;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">Creează cont</a>`,
          `</div>`,
          `<hr style="border:none;border-top:1px solid #e0e4ea;margin:24px 0"/>`,
          `<p style="color:#8892a8;font-size:12px">DosarFonduri &copy; ${new Date().getFullYear()}</p>`,
          `</div>`,
        ].join(""),
      }),
    });
    return c.json({ ok: true, email: user.email });
  } catch (emailErr: any) {
    console.error("[admin/resend-invite] Email send failed:", emailErr.message);
    return c.json({ error: "Trimiterea email-ului a eșuat" }, 500);
  }
});

// ─── PUT /users/:id ───
const updateUserSchema = z.object({
  role: z.enum(["admin", "consultant", "viewer"]).optional(),
  status: z.enum(["active", "invited", "disabled"]).optional(),
});

adminRoutes.put("/users/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = updateUserSchema.parse(await c.req.json());

  // Verify user belongs to org
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.organizationId, auth.organizationId!)),
  });
  if (!user) return c.json({ error: "User not found" }, 404);

  // Don't allow disabling yourself
  if (id === auth.userId && body.status === "disabled") {
    return c.json({ error: "Nu te poți dezactiva pe tine" }, 400);
  }

  const updates: Record<string, any> = {};
  if (body.role) updates.role = body.role;
  if (body.status) updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();

  // Strip sensitive fields before returning
  const { passwordHash: _, ...safeUser } = updated;
  return c.json(safeUser);
});

// ─── GET /ai-costs ───
adminRoutes.get("/ai-costs", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Current month total by agent
  const byAgent = await db
    .select({
      agent: aiUsageLog.agent,
      totalCost: sum(aiUsageLog.cost),
      totalCalls: count(),
      totalTokensInput: sum(aiUsageLog.tokensInput),
      totalTokensOutput: sum(aiUsageLog.tokensOutput),
    })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, auth.organizationId),
        gte(aiUsageLog.createdAt, monthStart)
      )
    )
    .groupBy(aiUsageLog.agent);

  // Previous month total
  const [prevMonth] = await db
    .select({ totalCost: sum(aiUsageLog.cost) })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, auth.organizationId),
        gte(aiUsageLog.createdAt, prevMonthStart),
        lte(aiUsageLog.createdAt, monthStart)
      )
    );

  // By project
  const byProject = await db
    .select({
      projectId: aiUsageLog.projectId,
      projectName: projects.name,
      agent: aiUsageLog.agent,
      totalCost: sum(aiUsageLog.cost),
      totalCalls: count(),
    })
    .from(aiUsageLog)
    .leftJoin(projects, eq(aiUsageLog.projectId, projects.id))
    .where(
      and(
        eq(aiUsageLog.organizationId, auth.organizationId),
        gte(aiUsageLog.createdAt, monthStart)
      )
    )
    .groupBy(aiUsageLog.projectId, projects.name, aiUsageLog.agent);

  // Daily for current month
  const daily = await db
    .select({
      date: sql<string>`DATE(${aiUsageLog.createdAt})`,
      totalCost: sum(aiUsageLog.cost),
    })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, auth.organizationId),
        gte(aiUsageLog.createdAt, monthStart)
      )
    )
    .groupBy(sql`DATE(${aiUsageLog.createdAt})`)
    .orderBy(sql`DATE(${aiUsageLog.createdAt})`);

  // By model
  const byModel = await db
    .select({
      model: aiUsageLog.model,
      totalCost: sum(aiUsageLog.cost),
      totalCalls: count(),
      totalTokensInput: sum(aiUsageLog.tokensInput),
      totalTokensOutput: sum(aiUsageLog.tokensOutput),
    })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.organizationId, auth.organizationId),
        gte(aiUsageLog.createdAt, monthStart)
      )
    )
    .groupBy(aiUsageLog.model);

  const totalMonth = byAgent.reduce((s, a) => s + Number(a.totalCost || 0), 0);

  return c.json({
    totalMonth,
    totalPrevMonth: Number(prevMonth?.totalCost || 0),
    byAgent,
    byModel,
    byProject,
    daily,
  });
});

// ─── GET /audit-log ───
adminRoutes.get("/audit-log", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "50");
  const type = c.req.query("type");
  const offset = (page - 1) * limit;

  const conditions = [eq(auditLog.organizationId, auth.organizationId)];
  if (type && type !== "all") {
    conditions.push(eq(auditLog.action, type));
  }

  const logs = await db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      userName: users.name,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(auditLog)
    .where(and(...conditions));

  return c.json({ logs, total, page, limit });
});
