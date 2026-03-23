import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { users, organizations, projects, aiUsageLog, auditLog } from "../db/schema";
import { eq, and, not, sql, desc, count, sum, gte, lte, ilike } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";
import { sendEmail } from "../services/email";

// HTML escape to prevent XSS in email templates
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ─── Email template builder for invitations ───
// Uses bulletproof table-based button + plaintext fallback URL
// so Yahoo/Gmail/Outlook always show a clickable link.
function buildInviteEmailHtml(opts: {
  orgName: string;
  role: string;
  email: string;
  signupUrl: string;
  heading: string;
  showEmailHint: boolean;
}): string {
  const { orgName, role, email, signupUrl, heading, showEmailHint } = opts;
  return [
    `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px">`,
    // Header
    `<div style="background:linear-gradient(135deg,#a78bfa 0%,#8b5cf6 100%);border-radius:12px;padding:24px 32px;margin-bottom:24px">`,
    `<h1 style="color:#fff;margin:0;font-size:22px">DosarFonduri</h1>`,
    `</div>`,
    // Heading
    `<h2 style="color:#1a1e28;margin:0 0 16px">${escapeHtml(heading)}</h2>`,
    // Body
    `<p style="color:#5a6478;font-size:15px;line-height:1.6">`,
    `Ai fost invitat să te alături cabinetului <strong>${escapeHtml(orgName)}</strong> cu rolul de <strong>${escapeHtml(role)}</strong>.`,
    `</p>`,
    showEmailHint
      ? `<p style="color:#5a6478;font-size:15px;line-height:1.6">Pentru a-ți activa contul, creează-ți un cont folosind adresa de email <strong>${escapeHtml(email)}</strong>:</p>`
      : "",
    // Bulletproof button (table-based — works in Yahoo, Gmail, Outlook)
    `<div style="text-align:center;margin:28px 0">`,
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:auto">`,
    `<tr><td style="border-radius:10px">`,
    `<a href="${signupUrl}" target="_blank" style="display:block;padding:14px 36px;background:#a78bfa;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:'DM Sans',Helvetica,Arial,sans-serif;border-radius:10px;text-align:center">Creează cont</a>`,
    `</td></tr>`,
    `</table>`,
    `</div>`,
    // Plaintext URL fallback (always visible — ensures link is accessible)
    `<p style="color:#8892a8;font-size:12px;line-height:1.5;word-break:break-all">`,
    `Dacă butonul nu funcționează, copiază acest link în browser:<br/>`,
    `<a href="${signupUrl}" style="color:#7c3aed;text-decoration:underline">${signupUrl}</a>`,
    `</p>`,
    // Footer
    `<p style="color:#8892a8;font-size:13px;line-height:1.5">`,
    `După înregistrare vei avea acces direct la cabinetul ${escapeHtml(orgName)} fără a fi nevoie de un cod de activare.`,
    `</p>`,
    `<hr style="border:none;border-top:1px solid #e0e4ea;margin:24px 0"/>`,
    `<p style="color:#8892a8;font-size:12px">DosarFonduri &copy; ${new Date().getFullYear()}</p>`,
    `</div>`,
  ].join("");
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
    .where(and(eq(users.organizationId, auth.organizationId), not(eq(users.status, "disabled"))));

  if (currentCount >= org.maxUsers) {
    return c.json({ error: `Limita de ${org.maxUsers} utilizatori atinsă` }, 400);
  }

  // Check email not already in use
  const existing = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });

  let newUser;

  if (existing && existing.status === "disabled" && existing.organizationId === auth.organizationId) {
    // Re-invite a previously disabled user from the same org
    [newUser] = await db
      .update(users)
      .set({
        status: "invited",
        role: body.role,
        passwordHash: "INVITED_NO_PASSWORD",
        invitedBy: auth.userId,
      })
      .where(eq(users.id, existing.id))
      .returning();
  } else if (existing) {
    return c.json({ error: "Email deja utilizat" }, 400);
  } else {
    // Pre-register user (invited status, placeholder password)
    [newUser] = await db
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
  }

  // Send invitation email via Resend
  const signupUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?invited=1&email=${encodeURIComponent(body.email)}`;
  const emailResult = await sendEmail({
    organizationId: auth.organizationId!,
    to: body.email,
    subject: `Ai fost invitat în cabinetul ${org.name} pe DosarFonduri`,
    html: buildInviteEmailHtml({
      orgName: org.name,
      role: body.role,
      email: body.email,
      signupUrl,
      heading: "Bine ai venit!",
      showEmailHint: true,
    }),
  });

  return c.json({ ...newUser, emailSent: emailResult.sent, emailError: emailResult.sent ? undefined : emailResult.reason }, 201);
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

  const signupUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?invited=1&email=${encodeURIComponent(user.email)}`;
  const emailResult = await sendEmail({
    organizationId: auth.organizationId!,
    to: user.email,
    subject: `Reminder: Ai fost invitat în cabinetul ${org.name} pe DosarFonduri`,
    html: buildInviteEmailHtml({
      orgName: org.name,
      role: user.role,
      email: user.email,
      signupUrl,
      heading: "Reminder invitație",
      showEmailHint: false,
    }),
  });

  if (!emailResult.sent) {
    const reason = emailResult.reason === "no_api_key"
      ? "Serviciul de email nu este configurat (RESEND_API_KEY lipsă)"
      : `Trimiterea email-ului a eșuat: ${emailResult.reason}`;
    return c.json({ error: reason, detail: emailResult }, 422);
  }
  return c.json({ ok: true, email: user.email, emailSent: emailResult.sent });
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
