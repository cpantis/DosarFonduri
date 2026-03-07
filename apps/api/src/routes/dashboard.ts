import { Hono } from "hono";
import { db } from "../db";
import {
  projects, companies, documents, projectElements, projectEligibility,
  projectDocuments, projectChecklist, auditLog, documentFolders, users,
} from "../db/schema";
import { eq, count, desc, and, ne } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const orgId = auth.organizationId;

  // KPI counts
  const [projectCount] = await db.select({ count: count() }).from(projects)
    .where(and(eq(projects.organizationId, orgId), ne(projects.status, "approved"), ne(projects.status, "rejected")));
  const [companyCount] = await db.select({ count: count() }).from(companies)
    .where(eq(companies.organizationId, orgId));
  const [docCount] = await db.select({ count: count() }).from(documents)
    .where(eq(documents.organizationId, orgId));

  // Approval rate (submitted+approved vs total non-draft)
  const [submittedCount] = await db.select({ count: count() }).from(projects)
    .where(and(eq(projects.organizationId, orgId), eq(projects.status, "approved")));
  const [totalNonDraft] = await db.select({ count: count() }).from(projects)
    .where(and(eq(projects.organizationId, orgId), ne(projects.status, "draft")));
  const approvalRate = totalNonDraft.count > 0 ? Math.round((submittedCount.count / totalNonDraft.count) * 100) : 0;

  // Recent projects (top 5) with full progress
  const recentProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, orgId),
    orderBy: (p, { desc: d }) => [d(p.updatedAt)],
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
    const checklist = await db.query.projectChecklist.findMany({
      where: eq(projectChecklist.projectId, p.id),
    });
    const docs = await db.query.projectDocuments.findMany({
      where: eq(projectDocuments.projectId, p.id),
    });

    // Build program path from folder
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
      checkDone: checklist.filter(e => e.done).length,
      checkTotal: checklist.length,
      docsGenerated: docs.filter(e => e.status === "generated" || e.status === "validated").length,
      docsTotal: docs.length,
    };
  }));

  // Activity feed (last 15) enriched with user name
  const activityRaw = await db
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
    .where(eq(auditLog.organizationId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(15);

  // Deadlines: sessions (folders of type 'sesiune') that have projects, within 30 days
  // We'll look at projects linked to session folders and use folder metadata
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 86400000);

  // Get session folders for this org
  const sessionFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.organizationId, orgId),
      eq(documentFolders.type, "sesiune"),
    ),
  });

  // Build deadlines from projects that reference session folders
  const deadlines: Array<{
    date: string;
    project: string;
    event: string;
    urgent: boolean;
    daysLeft: number;
  }> = [];

  for (const sf of sessionFolders) {
    const projectsInSession = await db.query.projects.findMany({
      where: and(
        eq(projects.organizationId, orgId),
        eq(projects.folderId, sf.id),
        ne(projects.status, "approved"),
        ne(projects.status, "rejected"),
      ),
      limit: 3,
    });

    for (const proj of projectsInSession) {
      // Use session name as event, and createdAt + 30 days as estimated deadline
      const estimatedDeadline = new Date(sf.createdAt.getTime() + 60 * 86400000);
      if (estimatedDeadline <= thirtyDays && estimatedDeadline >= now) {
        const daysLeft = Math.ceil((estimatedDeadline.getTime() - now.getTime()) / 86400000);
        deadlines.push({
          date: estimatedDeadline.toISOString().slice(0, 10),
          project: proj.name,
          event: `Termen ${sf.name}`,
          urgent: daysLeft <= 7,
          daysLeft,
        });
      }
    }
  }

  deadlines.sort((a, b) => a.daysLeft - b.daysLeft);

  return c.json({
    stats: {
      projects: projectCount.count,
      companies: companyCount.count,
      documents: docCount.count,
      approvalRate,
    },
    recentProjects: enrichedProjects,
    activity: activityRaw,
    deadlines: deadlines.slice(0, 5),
  });
});
