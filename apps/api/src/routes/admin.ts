import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { users, organizations, projects, aiUsageLog, auditLog } from "../db/schema";
import { eq, and, sql, desc, count, sum, gte, lte, ilike } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";

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

  return c.json(newUser, 201);
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

  return c.json(updated);
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
