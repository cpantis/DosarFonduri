import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import {
  projects, companies, documents, projectElements, projectEligibility,
  projectDocuments, projectChecklist, auditLog, documentFolders, users,
} from "../db/schema";
import { eq, count, desc, and, ne, sql, inArray } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const orgId = auth.organizationId;

  // KPI counts + approval rate — parallel independent queries
  const [
    [projectCount],
    [companyCount],
    [docCount],
    [approvalStats],
    recentProjects,
  ] = await Promise.all([
    db.select({ count: count() }).from(projects)
      .where(and(eq(projects.organizationId, orgId), ne(projects.status, "approved"), ne(projects.status, "rejected"))),
    db.select({ count: count() }).from(companies)
      .where(eq(companies.organizationId, orgId)),
    db.select({ count: count() }).from(documents)
      .where(eq(documents.organizationId, orgId)),
    db.select({
      approved: sql<number>`count(case when ${projects.status} = 'approved' then 1 end)`,
      nonDraft: sql<number>`count(case when ${projects.status} != 'draft' then 1 end)`,
    }).from(projects).where(eq(projects.organizationId, orgId)),
    db.query.projects.findMany({
      where: eq(projects.organizationId, orgId),
      orderBy: (p, { desc: d }) => [d(p.updatedAt)],
      limit: 5,
    }),
  ]);

  const approvalRate = approvalStats.nonDraft > 0
    ? Math.round((approvalStats.approved / approvalStats.nonDraft) * 100) : 0;

  // Enrich recent projects with batch queries instead of N+1
  const projectIds = recentProjects.map(p => p.id);
  const companyIds = [...new Set(recentProjects.map(p => p.companyId).filter(Boolean))] as string[];
  const folderIds = [...new Set(recentProjects.map(p => p.folderId).filter(Boolean))] as string[];

  let companyMap: Record<string, string> = {};
  let folderMap: Record<string, { name: string; parentId: string | null }> = {};
  let elementStats: Array<{ projectId: string; total: number; filled: number }> = [];
  let eligStats: Array<{ projectId: string; total: number; passed: number }> = [];
  let checkStats: Array<{ projectId: string; total: number; done: number }> = [];
  let docStats: Array<{ projectId: string; total: number; generated: number }> = [];

  if (projectIds.length > 0) {
    const [companiesRaw, foldersRaw, elemRaw, eligRaw, checkRaw, docRaw] = await Promise.all([
      companyIds.length > 0
        ? db.select({ id: companies.id, denumire: companies.denumire })
            .from(companies).where(inArray(companies.id, companyIds))
        : Promise.resolve([]),
      folderIds.length > 0
        ? db.select({ id: documentFolders.id, name: documentFolders.name, parentId: documentFolders.parentId })
            .from(documentFolders).where(inArray(documentFolders.id, folderIds))
        : Promise.resolve([]),
      db.select({
        projectId: projectElements.projectId,
        total: count(),
        filled: sql<number>`count(case when ${projectElements.value} is not null and trim(${projectElements.value}) != '' then 1 end)`,
      }).from(projectElements).where(inArray(projectElements.projectId, projectIds)).groupBy(projectElements.projectId),
      db.select({
        projectId: projectEligibility.projectId,
        total: count(),
        passed: sql<number>`count(case when ${projectEligibility.status} = 'passed' then 1 end)`,
      }).from(projectEligibility).where(inArray(projectEligibility.projectId, projectIds)).groupBy(projectEligibility.projectId),
      db.select({
        projectId: projectChecklist.projectId,
        total: count(),
        done: sql<number>`count(case when ${projectChecklist.done} = true then 1 end)`,
      }).from(projectChecklist).where(inArray(projectChecklist.projectId, projectIds)).groupBy(projectChecklist.projectId),
      db.select({
        projectId: projectDocuments.projectId,
        total: count(),
        generated: sql<number>`count(case when ${projectDocuments.status} in ('generated', 'validated') then 1 end)`,
      }).from(projectDocuments).where(inArray(projectDocuments.projectId, projectIds)).groupBy(projectDocuments.projectId),
    ]);

    for (const c of companiesRaw) companyMap[c.id] = c.denumire || "";
    for (const f of foldersRaw) folderMap[f.id] = { name: f.name, parentId: f.parentId };
    elementStats = elemRaw;
    eligStats = eligRaw;
    checkStats = checkRaw;
    docStats = docRaw;
  }

  // Resolve parent folder names for program labels
  const parentIds = [...new Set(
    Object.values(folderMap).map(f => f.parentId).filter(Boolean)
  )] as string[];
  let parentMap: Record<string, string> = {};
  if (parentIds.length > 0) {
    const parents = await db.select({ id: documentFolders.id, name: documentFolders.name })
      .from(documentFolders).where(inArray(documentFolders.id, parentIds));
    for (const p of parents) parentMap[p.id] = p.name;
  }

  const enrichedProjects = recentProjects.map(p => {
    const folder = p.folderId ? folderMap[p.folderId] : null;
    const programLabel = folder?.parentId && parentMap[folder.parentId]
      ? parentMap[folder.parentId] : (folder?.name || "");
    const elem = elementStats.find(e => e.projectId === p.id);
    const elig = eligStats.find(e => e.projectId === p.id);
    const check = checkStats.find(e => e.projectId === p.id);
    const doc = docStats.find(e => e.projectId === p.id);

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
      firma: p.companyId ? (companyMap[p.companyId] || "") : "",
      program: programLabel,
      eligibility: elig?.passed ?? 0,
      eligTotal: elig?.total ?? 0,
      elements: elem?.filled ?? 0,
      elemTotal: elem?.total ?? 0,
      checkDone: check?.done ?? 0,
      checkTotal: check?.total ?? 0,
      docsGenerated: doc?.generated ?? 0,
      docsTotal: doc?.total ?? 0,
    };
  });

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

  // Build deadlines — batch query for projects in all session folders at once
  const sessionFolderIds = sessionFolders.map(sf => sf.id);
  const sessionFolderMap = new Map(sessionFolders.map(sf => [sf.id, sf]));

  const deadlines: Array<{
    date: string;
    project: string;
    event: string;
    urgent: boolean;
    daysLeft: number;
  }> = [];

  if (sessionFolderIds.length > 0) {
    const projectsInSessions = await db.query.projects.findMany({
      where: and(
        eq(projects.organizationId, orgId),
        inArray(projects.folderId, sessionFolderIds),
        ne(projects.status, "approved"),
        ne(projects.status, "rejected"),
      ),
    });

    for (const proj of projectsInSessions) {
      const sf = sessionFolderMap.get(proj.folderId!);
      if (!sf) continue;
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

  // F12.1: Generate alerts from real data
  const alerts: Array<{ message: string; type: "warning" | "error" | "info" }> = [];

  // Alert for urgent deadlines (<=7 days)
  const urgentDeadlines = deadlines.filter(d => d.urgent);
  if (urgentDeadlines.length > 0) {
    alerts.push({ message: `${urgentDeadlines.length} termen(e) urgent(e) în următoarele 7 zile`, type: "warning" });
  }

  // Alert for projects with failed eligibility
  for (const p of enrichedProjects) {
    if (p.eligTotal > 0 && p.eligibility < p.eligTotal * 0.5) {
      alerts.push({ message: `Proiectul „${p.name}" are doar ${p.eligibility}/${p.eligTotal} criterii de eligibilitate îndeplinite`, type: "warning" });
    }
  }

  // Alert for companies/documents with errors — parallel count queries
  const [[errorCompanyCount], [errorDocCount]] = await Promise.all([
    db.select({ count: count() }).from(companies)
      .where(and(eq(companies.organizationId, orgId), eq(companies.processingStatus, "error"))),
    db.select({ count: count() }).from(documents)
      .where(and(eq(documents.organizationId, orgId), eq(documents.status, "error"))),
  ]);
  if (errorCompanyCount.count > 0) {
    alerts.push({ message: `${errorCompanyCount.count} firmă/firme cu erori de procesare`, type: "error" });
  }
  if (errorDocCount.count > 0) {
    alerts.push({ message: `${errorDocCount.count} document(e) cu erori de procesare`, type: "error" });
  }

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
    alerts,
  });
});
