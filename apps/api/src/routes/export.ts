import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { projects, projectElements, templateElements, orgConfig, auditLog, companies } from "../db/schema";
import { eq, inArray, sql, and } from "drizzle-orm";
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

  // Batch fetch all elements for all projects
  const projectIds = allProjects.map(p => p.id);
  const allElements = projectIds.length > 0
    ? await db.query.projectElements.findMany({
        where: inArray(projectElements.projectId, projectIds),
      })
    : [];

  // Batch fetch all referenced template elements
  const teIds = [...new Set(allElements.map(e => e.templateElementId).filter(Boolean))] as string[];
  const allTemplateEls = teIds.length > 0
    ? await db.query.templateElements.findMany({
        where: inArray(templateElements.id, teIds),
        columns: { id: true, key: true, label: true },
      })
    : [];
  const teMap = new Map(allTemplateEls.map(t => [t.id, t]));

  // Group elements by project and enrich
  const enriched = allProjects.map(p => {
    const elements = allElements
      .filter(e => e.projectId === p.id)
      .map(e => {
        const te = e.templateElementId ? teMap.get(e.templateElementId) : null;
        return {
          key: te?.key,
          label: te?.label,
          value: e.value,
          source: e.source,
          confirmed: e.confirmed,
        };
      });
    return { ...p, elements };
  });

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

// Export projects CSV — admin only
exportRoutes.get("/projects-csv", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const allProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, auth.organizationId),
  });

  const companyIds = [...new Set(allProjects.map(p => p.companyId))];
  const allCompanies = companyIds.length > 0
    ? await db.query.companies.findMany({
        where: eq(companies.organizationId, auth.organizationId!),
      })
    : [];
  const companyMap = Object.fromEntries(allCompanies.map(c => [c.id, c]));

  // Batch count elements per project (single query instead of N)
  const csvProjectIds = allProjects.map(p => p.id);
  const elementCountRows = csvProjectIds.length > 0
    ? await db.select({
        projectId: projectElements.projectId,
        total: sql<number>`count(*)::int`,
        filled: sql<number>`count(case when ${projectElements.value} IS NOT NULL and ${projectElements.value} != '' then 1 end)::int`,
        confirmed: sql<number>`count(case when ${projectElements.confirmed} = true then 1 end)::int`,
      }).from(projectElements)
        .where(inArray(projectElements.projectId, csvProjectIds))
        .groupBy(projectElements.projectId)
    : [];
  const elementCounts: Record<string, { total: number; filled: number; confirmed: number }> = {};
  for (const row of elementCountRows) {
    elementCounts[row.projectId] = { total: row.total, filled: row.filled, confirmed: row.confirmed };
  }

  const escapeCsv = (val: string | null | undefined) => {
    if (!val) return "";
    // Prevent CSV injection: prefix formula-triggering characters with a single quote
    let safe = val;
    if (/^[=+\-@\t\r]/.test(safe)) {
      safe = "'" + safe;
    }
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const header = "id,nume_proiect,status,firma,cui,program,cod_masura,valoare,deadline,elemente_total,elemente_completate,elemente_confirmate,creat_la\n";
  const rows = allProjects.map(p => {
    const comp = companyMap[p.companyId];
    const ec = elementCounts[p.id] || { total: 0, filled: 0, confirmed: 0 };
    return [
      p.id,
      escapeCsv(p.name),
      p.status,
      escapeCsv(comp?.denumire || ""),
      comp?.cui || "",
      escapeCsv(p.programFinantare || ""),
      escapeCsv(p.codMasura || ""),
      p.valoare || "",
      p.deadline ? p.deadline.toISOString().slice(0, 10) : "",
      ec.total,
      ec.filled,
      ec.confirmed,
      p.createdAt?.toISOString().slice(0, 10) || "",
    ].join(",");
  }).join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_proiecte_${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.text("\ufeff" + header + rows); // BOM for Excel compatibility
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

  const escapeCsvField = (val: string | null | undefined) => {
    if (!val) return "";
    let safe = val;
    if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const header = "timestamp,user_id,action,entity_type,entity_id\n";
  const rows = logs.map(l =>
    `${l.createdAt?.toISOString()},${escapeCsvField(l.userId)},${escapeCsvField(l.action)},${escapeCsvField(l.entityType)},${escapeCsvField(l.entityId)}`
  ).join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_activity_${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.text("\ufeff" + header + rows);
});
