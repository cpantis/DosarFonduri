import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  companies, companyAssociates, companyAdministrators,
  companyFinancials, companyIfMembers,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { lookupCUI, FORMA_MAP } from "../services/onrc";
import { lookupCUI_ListaFirme, searchCompany_ListaFirme } from "../services/listafirme";
import { uploadFile, deleteFile } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processCompanyQueue, JOB_PRIORITY } from "../lib/queue";

// Helper: ensure processing_status columns exist (self-healing)
async function ensureProcessingColumns() {
  try {
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_status" varchar(20) DEFAULT 'idle'`);
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_error" text`);
  } catch { /* ignore */ }
}

// Helper: dispatch company processing job to BullMQ queue
async function dispatchCompanyJob(
  type: "onrc-extract" | "onrc-update" | "bilant-parse",
  data: Record<string, any>,
) {
  const jobName = `${type}:${data.companyId}`;
  await processCompanyQueue.add(jobName, { type, ...data }, {
    priority: JOB_PRIORITY.COMPANY,
    jobId: `${type}-${data.companyId}-${Date.now()}`,
  });
  console.log(`[queue] Dispatched ${type} job for company ${data.companyId}`);
}

export const companyRoutes = new Hono<AppEnv>();

// --- LIST COMPANIES ---
companyRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const result = await db.query.companies.findMany({
    where: eq(companies.organizationId, auth.organizationId),
    orderBy: (companies, { desc }) => [desc(companies.updatedAt)],
  });

  return c.json(result);
});

// --- COMPANY DETAILS ---
companyRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const associates = await db.query.companyAssociates.findMany({
    where: eq(companyAssociates.companyId, id),
  });

  const admins = await db.query.companyAdministrators.findMany({
    where: eq(companyAdministrators.companyId, id),
  });

  const financials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  let ifMembers = undefined;
  if (company.formaJuridica === "IF") {
    ifMembers = await db.query.companyIfMembers.findMany({
      where: eq(companyIfMembers.companyId, id),
    });
  }

  return c.json({
    ...company,
    asociatiPF: associates.filter(a => a.type === "pf"),
    asociatiPJ: associates.filter(a => a.type === "pj"),
    administratori: admins,
    financials,
    ifMembers,
  });
});

// --- PROCESSING STATUS ---
companyRoutes.get("/:id/processing-status", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  return c.json({
    processingStatus: (company as any).processingStatus || "idle",
    processingError: (company as any).processingError || null,
    denumire: company.denumire,
    cui: company.cui,
  });
});

// --- ADD COMPANY (CUI auto) ---
const addByCUISchema = z.object({
  cui: z.string().min(4),
  mode: z.literal("auto"),
});

companyRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const contentType = c.req.header("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    // Manual upload - certificat constatator or combined PDF
    // Non-blocking: upload file, create placeholder company, process in background
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    const formaJuridica = (formData.get("formaJuridica") as string) || "SRL";

    if (!file) return c.json({ error: "Fișier lipsă" }, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId, auth.userId);

    // Ensure processing columns exist
    await ensureProcessingColumns();

    // Create company with placeholder data — will be enriched by background processor
    const [company] = await db.insert(companies).values({
      organizationId: auth.organizationId,
      formaJuridica: formaJuridica as any,
      denumire: file.name.replace(/\.[^.]+$/, "").substring(0, 100) || "Se procesează...",
      cui: `PROC-${Date.now()}`,
      certificatFileId: fileId,
      processingStatus: "processing",
      createdBy: auth.userId,
    }).returning();

    // Dispatch to BullMQ queue — persistent, retryable, concurrency-controlled
    await dispatchCompanyJob("onrc-extract", {
      companyId: company.id,
      fileId,
      organizationId: auth.organizationId,
    });

    return c.json(company, 201);
  }

  // Auto mode (CUI lookup)
  const body = addByCUISchema.parse(await c.req.json());

  // Check duplicate
  const existing = await db.query.companies.findFirst({
    where: and(
      eq(companies.cui, body.cui.replace(/\D/g, "")),
      eq(companies.organizationId, auth.organizationId),
    ),
  });
  if (existing) return c.json({ error: "Firma cu acest CUI există deja" }, 400);

  // Lookup ONRC
  const onrcData = await lookupCUI(body.cui, auth.organizationId);
  if (!onrcData) return c.json({ error: "CUI-ul nu a fost găsit" }, 404);

  // Determine forma juridica
  const formaCode = Object.entries(FORMA_MAP).find(([k]) => (onrcData.formaJuridica || "").includes(k))?.[1] || "SRL";

  // Insert company + related data in a single transaction
  const orgId = auth.organizationId!;
  try {
    const company = await db.transaction(async (tx) => {
      const [comp] = await tx.insert(companies).values({
        organizationId: orgId,
        formaJuridica: formaCode as any,
        denumire: onrcData.denumire,
        cui: onrcData.cui,
        regCom: onrcData.regCom,
        euid: onrcData.euid,
        adresa: onrcData.adresa,
        localitate: onrcData.localitate,
        judet: onrcData.judet,
        codPostal: onrcData.codPostal,
        telefon: onrcData.telefon,
        email: onrcData.email,
        website: onrcData.website,
        stare: onrcData.stare.includes("radia") ? "radiata" : "functiune" as any,
        durata: onrcData.durata,
        anInfiintare: onrcData.anInfiintare,
        capitalSocial: onrcData.capitalSocial?.toString(),
        moneda: onrcData.moneda,
        partiSociale: onrcData.partiSociale,
        actiuni: onrcData.actiuni,
        valoareParte: onrcData.valoareParte?.toString(),
        valoareActiune: onrcData.valoareActiune?.toString(),
        naturaCapital: onrcData.naturaCapital,
        onrcRawData: onrcData.rawData,
        lastSyncedAt: new Date(),
        createdBy: auth.userId,
      }).returning();

      if (onrcData.asociatiPF.length > 0) {
        await tx.insert(companyAssociates).values(
          onrcData.asociatiPF.map(a => ({
            companyId: comp.id,
            type: "pf" as const,
            name: a.nume,
            role: a.calitate,
            citizenshipOrCountry: a.cetatenie,
            contribution: a.aport?.toString(),
            shares: a.partiSociale || a.actiuni,
            pctBenefits: a.cotaBeneficii?.toString(),
            pctLosses: a.cotaPierderi?.toString(),
            tipAsociat: a.tipAsociat,
          }))
        );
      }

      if (onrcData.asociatiPJ.length > 0) {
        await tx.insert(companyAssociates).values(
          onrcData.asociatiPJ.map(a => ({
            companyId: comp.id,
            type: "pj" as const,
            name: a.denumire,
            role: a.calitate,
            citizenshipOrCountry: a.tara,
            contribution: a.aport?.toString(),
            shares: a.partiSociale || a.actiuni,
            pctBenefits: a.cotaBeneficii?.toString(),
            pctLosses: a.cotaPierderi?.toString(),
          }))
        );
      }

      if (onrcData.administratori.length > 0) {
        await tx.insert(companyAdministrators).values(
          onrcData.administratori.map(a => ({
            companyId: comp.id,
            name: a.nume,
            role: a.functie,
            powers: a.puteri,
            mandateDuration: a.durataMandatLabel,
            appointmentDate: a.dataNumirii,
          }))
        );
      }

      if (onrcData.situatiiFinanciare.length > 0) {
        await tx.insert(companyFinancials).values(
          onrcData.situatiiFinanciare.map(s => ({
            companyId: comp.id,
            year: s.an,
            source: "onrc" as const,
            f20: { cifraAfaceriNeta: s.cifraAfaceri, profitNet: s.profitNet },
            f30: { numarMediuSalariati: s.angajati },
            f10: s.capitaluriProprii ? { capitaluriProprii: s.capitaluriProprii } : undefined,
          }))
        );
      }

      return comp;
    });

    return c.json(company, 201);
  } catch (err: any) {
    console.error("[companies/create] Transaction failed:", err.message);
    return c.json({ error: `Eroare la crearea firmei: ${err.message}` }, 500);
  }
});

// --- SYNC ONRC ---
companyRoutes.post("/:id/sync-onrc", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const onrcData = await lookupCUI(company.cui, auth.organizationId!);
  if (!onrcData) return c.json({ error: "CUI negăsit la ONRC" }, 404);

  await db.update(companies).set({
    denumire: onrcData.denumire,
    adresa: onrcData.adresa,
    localitate: onrcData.localitate,
    judet: onrcData.judet,
    telefon: onrcData.telefon,
    email: onrcData.email,
    stare: onrcData.stare.includes("radia") ? "radiata" : "functiune" as any,
    onrcRawData: onrcData.rawData,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(companies.id, id));

  return c.json({ ok: true, message: "Sincronizare completă" });
});

// --- UPLOAD ANAF BALANCE SHEET ---
// Non-blocking: upload file, process bilant in background
companyRoutes.post("/:id/upload-bilant", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const year = parseInt(formData.get("year") as string);
  if (!file || !year) return c.json({ error: "Fișier și an sunt obligatorii" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  await ensureProcessingColumns();

  // Mark company as processing
  await db.update(companies).set({
    processingStatus: "processing",
    processingError: null,
  }).where(eq(companies.id, id));

  // Dispatch to BullMQ queue — persistent, retryable
  await dispatchCompanyJob("bilant-parse", {
    companyId: id,
    fileId,
    year,
    organizationId: auth.organizationId,
  });

  return c.json({ ok: true, year, processingStatus: "processing", message: "Fișier încărcat, se procesează în fundal..." });
});

// --- SEARCH CUI (ListaFirme.ro) ---
companyRoutes.get("/search-cui", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const query = c.req.query("q") || "";
  if (!query || query.length < 2) return c.json([]);

  try {
    // If query is numeric, treat as CUI lookup
    const isNumeric = /^\d+$/.test(query.replace(/\D/g, ""));
    if (isNumeric && query.replace(/\D/g, "").length >= 4) {
      const result = await lookupCUI_ListaFirme(query);
      if (result) {
        return c.json([{
          name: result.name,
          fiscalCode: result.taxCode,
          county: result.county,
          legalForm: result.legalForm,
          status: result.status,
          source: "listafirme",
        }]);
      }
      return c.json([]);
    }

    // Otherwise search by name
    const results = await searchCompany_ListaFirme(query);
    return c.json(results.slice(0, 10).map(r => ({
      name: r.name,
      fiscalCode: r.fiscalCode,
      county: r.county,
      source: "listafirme",
    })));
  } catch (err: any) {
    // If ListaFirme is not configured, return empty
    if (err.message?.includes("LISTAFIRME_API_KEY")) {
      return c.json([]);
    }
    throw err;
  }
});

// --- ADD COMPANY FROM LISTAFIRME ---
companyRoutes.post("/from-listafirme", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const { cui } = await c.req.json();
  if (!cui) return c.json({ error: "CUI obligatoriu" }, 400);

  const cleanCUI = cui.replace(/\D/g, "");

  // Check duplicate
  const existing = await db.query.companies.findFirst({
    where: and(eq(companies.cui, cleanCUI), eq(companies.organizationId, auth.organizationId)),
  });
  if (existing) return c.json({ error: "Firma cu CUI " + cleanCUI + " există deja" }, 400);

  // Lookup from ListaFirme
  const lfData = await lookupCUI_ListaFirme(cleanCUI);
  if (!lfData) return c.json({ error: "CUI-ul nu a fost găsit pe ListaFirme.ro" }, 404);

  // Map legal form (reuse FORMA_MAP from onrc.ts for consistency)
  const formaRaw = (lfData.legalForm || "").toUpperCase();
  const formaCode = Object.entries(FORMA_MAP).find(([k]) => formaRaw.includes(k))?.[1] || "SRL";

  // Parse founded year
  const foundedYear = lfData.foundedDate ? parseInt(lfData.foundedDate.slice(0, 4)) : undefined;

  // Insert company + related data in a single transaction
  const orgId2 = auth.organizationId!;
  try {
    const company = await db.transaction(async (tx) => {
      const [comp] = await tx.insert(companies).values({
        organizationId: orgId2,
        formaJuridica: formaCode as any,
        denumire: lfData.name,
        cui: lfData.taxCode,
        regCom: lfData.regNo || undefined,
        adresa: lfData.address || undefined,
        localitate: lfData.city || undefined,
        judet: lfData.county || undefined,
        telefon: lfData.phone || undefined,
        email: lfData.email || undefined,
        website: lfData.web || undefined,
        caen: lfData.nace || undefined,
        stare: (lfData.status || "").toLowerCase().includes("radia") ? "radiata" as const : "functiune" as const,
        anInfiintare: foundedYear && !isNaN(foundedYear) ? foundedYear : undefined,
        onrcRawData: {
          ...lfData.raw,
          caenDesc: lfData.naceDescription || "",
          activitatiSecundare: lfData.naceSecondary || [],
        },
        lastSyncedAt: new Date(),
        createdBy: auth.userId,
      }).returning();

      if (lfData.administrators.length > 0) {
        await tx.insert(companyAdministrators).values(
          lfData.administrators.map(a => ({
            companyId: comp.id,
            name: a.name,
            role: a.role || "administrator",
            appointmentDate: a.since || undefined,
          }))
        );
      }

      if (lfData.shareholders.length > 0) {
        await tx.insert(companyAssociates).values(
          lfData.shareholders.map(s => ({
            companyId: comp.id,
            type: "pf" as const,
            name: s.name,
            role: "asociat",
            shares: s.shares ? parseInt(s.shares.replace(/\D/g, "")) || undefined : undefined,
          }))
        );
      }

      if (lfData.turnover !== null || lfData.profit !== null) {
        const currentYear = new Date().getFullYear() - 1;
        await tx.insert(companyFinancials).values({
          companyId: comp.id,
          year: currentYear,
          source: "onrc" as const,
          f20: {
            cifraAfaceriNeta: lfData.turnover,
            profitNet: lfData.profit,
          },
          f30: {
            numarMediuSalariati: lfData.employees,
          },
        }).onConflictDoNothing();
      }

      return comp;
    });

    return c.json(company, 201);
  } catch (err: any) {
    console.error("[companies/from-listafirme] Transaction failed:", err.message);
    return c.json({ error: `Eroare la crearea firmei: ${err.message}` }, 500);
  }
});

// --- UPLOAD ONRC (Certificat Constatator) - UPDATE EXISTING COMPANY ---
// Non-blocking: upload file, mark as processing, return immediately
companyRoutes.post("/:id/upload-onrc", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  await ensureProcessingColumns();

  // Mark company as processing and set file
  await db.update(companies).set({
    certificatFileId: fileId,
    processingStatus: "processing",
    processingError: null,
  }).where(eq(companies.id, id));

  // Dispatch to BullMQ queue — persistent, retryable
  await dispatchCompanyJob("onrc-update", {
    companyId: id,
    fileId,
    organizationId: auth.organizationId,
  });

  return c.json({ ok: true, message: "Fișier încărcat, se procesează în fundal...", processingStatus: "processing" });
});

// --- FINANCIALS PER YEAR ---
companyRoutes.get("/:id/financials", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Verify company belongs to user's organization
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const financials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  return c.json(financials);
});

// --- UPDATE COMPANY ---
companyRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = await c.req.json();

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const allowedFields = ["denumire", "formaJuridica", "caen", "adresa", "localitate", "judet", "telefon", "email", "website", "capitalSocial", "moneda", "partiSociale", "valoareParte"];
  const updateData: Record<string, any> = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const [updated] = await db.update(companies).set(updateData).where(eq(companies.id, id)).returning();

  return c.json(updated);
});

// --- DELETE COMPANY ---
companyRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (auth.role !== "admin") return c.json({ error: "Doar administratorul poate șterge firme" }, 403);

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  // Delete R2 files: certificat constatator
  if (company.certificatFileId) {
    await deleteFile(company.certificatFileId).catch(() => {});
  }

  // Delete R2 files: bilant PDFs
  const financials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, id),
  });
  for (const fin of financials) {
    if (fin.fileId) {
      await deleteFile(fin.fileId).catch(() => {});
    }
  }

  // Cascade deletes handle associates, admins, financials, IF members
  await db.delete(companies).where(eq(companies.id, id));

  return c.json({ ok: true });
});
