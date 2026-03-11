import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { projects, projectElements, templateElements, orgConfig, auditLog, companies } from "../db/schema";
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
    ? await db.query.companies.findMany()
    : [];
  const companyMap = Object.fromEntries(allCompanies.map(c => [c.id, c]));

  // Count elements per project
  const elementCounts: Record<string, { total: number; filled: number; confirmed: number }> = {};
  for (const p of allProjects) {
    const els = await db.query.projectElements.findMany({
      where: eq(projectElements.projectId, p.id),
    });
    elementCounts[p.id] = {
      total: els.length,
      filled: els.filter(e => e.value && e.value.trim() !== "").length,
      confirmed: els.filter(e => e.confirmed).length,
    };
  }

  const escapeCsv = (val: string | null | undefined) => {
    if (!val) return "";
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
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

  const header = "timestamp,user_id,action,entity_type,entity_id\n";
  const rows = logs.map(l =>
    `${l.createdAt?.toISOString()},${l.userId},${l.action},${l.entityType || ""},${l.entityId || ""}`
  ).join("\n");

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_activity_${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.text(header + rows);
});
