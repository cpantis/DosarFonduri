import { Hono } from "hono";
import { db } from "../db";
import {
  projects, companies, documents, projectElements, projectEligibility,
  projectDocuments, auditLog, documentFolders,
} from "../db/schema";
import { eq, count, desc } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const orgId = auth.organizationId;

  // KPI counts
  const [projectCount] = await db.select({ count: count() }).from(projects)
    .where(eq(projects.organizationId, orgId));
  const [companyCount] = await db.select({ count: count() }).from(companies)
    .where(eq(companies.organizationId, orgId));
  const [docCount] = await db.select({ count: count() }).from(documents)
    .where(eq(documents.organizationId, orgId));

  // Recent projects (top 5) with progress
  const recentProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, orgId),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
    limit: 5,
  });

  const enrichedProjects = await Promise.all(recentProjects.map(async (p) => {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, p.companyId),
    });

    const elements = await db.query.projectElements.findMany({
      where: eq(projectElements.projectId, p.id),
    });
    const eligibility = await db.query.projectEligibility.findMany({
      where: eq(projectEligibility.projectId, p.id),
    });

    // Build program path
    const folder = await db.query.documentFolders.findFirst({ where: eq(documentFolders.id, p.folderId) });
    let programLabel = folder?.name || "";
    if (folder?.parentId) {
      const parent = await db.query.documentFolders.findFirst({ where: eq(documentFolders.id, folder.parentId) });
      if (parent) programLabel = parent.name;
    }

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
      firma: company?.denumire || "",
      program: programLabel,
      eligibility: eligibility.filter(e => e.status === "passed").length,
      eligTotal: eligibility.length,
      elements: elements.filter(e => e.value && e.value.trim() !== "").length,
      elemTotal: elements.length,
    };
  }));

  // Activity feed (last 15)
  const activity = await db.query.auditLog.findMany({
    where: eq(auditLog.organizationId, orgId),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
    limit: 15,
  });

  return c.json({
    stats: {
      projects: projectCount.count,
      companies: companyCount.count,
      documents: docCount.count,
    },
    recentProjects: enrichedProjects,
    activity,
  });
});
