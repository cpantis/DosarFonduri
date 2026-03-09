import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { projects, projectElements, templateElements, orgConfig, auditLog } from "../db/schema";
import { eq } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";

export const exportRoutes = new Hono<AppEnv>();

// Export all projects (JSON) — admin only
exportRoutes.get("/projects", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const allProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, auth.organizationId),
  });

  const enriched = await Promise.all(allProjects.map(async (p) => {
    const elements = await db.query.projectElements.findMany({
      where: eq(projectElements.projectId, p.id),
    });

    const elementsWithLabels = await Promise.all(elements.map(async (e) => {
      const te = await db.query.templateElements.findFirst({
        where: eq(templateElements.id, e.templateElementId),
      });
      return {
        key: te?.key,
        label: te?.label,
        value: e.value,
        source: e.source,
        confirmed: e.confirmed,
      };
    }));

    return { ...p, elements: elementsWithLabels };
  }));

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_projects_${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(enriched);
});

// Export org config (JSON) — admin only
exportRoutes.get("/config", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, auth.organizationId),
  });

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_config_${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(config || {});
});

// Export activity CSV — admin only
exportRoutes.get("/activity", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const logs = await db.query.auditLog.findMany({
    where: eq(auditLog.organizationId, auth.organizationId),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 10000,
  });

  const header = "timestamp,user_id,action,entity_type,entity_id\n";
  const rows = logs.map(l =>
    `${l.createdAt?.toISOString()},${l.userId},${l.action},${l.entityType || ""},${l.entityId || ""}`
  ).join("\n");

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_activity_${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.text(header + rows);
});
