import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  companies, companyAssociates, companyAdministrators,
  companyFinancials, companyIfMembers, documentFolders, rules, documents,
  projects, projectDocuments, companyElements, formaJuridicaEnum,
} from "../db/schema";

type FormaJuridica = (typeof formaJuridicaEnum.enumValues)[number];
import { eq, and, sql, inArray, count } from "drizzle-orm";
import { KNOWN_COMPANY_FIELDS, FIELD_CATEGORIES, resolveFieldKey, getFieldDef } from "@dosarfonduri/shared";
import { lookupCUI, FORMA_MAP } from "../services/onrc";
import { lookupCUI_ListaFirme, searchCompany_ListaFirme, type ListaFirmeCompany } from "../services/listafirme";
import { uploadFile, deleteFile } from "../services/storage";
import { AuthContext } from "../middleware/auth";
import { processCompanyQueue, JOB_PRIORITY } from "../lib/queue";
import { populateCompanyElements } from "../services/companyElements";
import { checkPreEligibility } from "../services/preEligibility";

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

// Helper: create a company from ListaFirme data, storing ALL available fields
async function insertCompanyFromListaFirme(
  lfData: ListaFirmeCompany,
  organizationId: string,
  userId: string,
) {
  const formaRaw = (lfData.legalForm || "").toUpperCase();
  const formaCode = Object.entries(FORMA_MAP).find(([k]) => formaRaw.includes(k))?.[1] || "SRL";
  const foundedYear = lfData.foundedDate ? parseInt(lfData.foundedDate.slice(0, 4)) : undefined;
  const stareRaw = (lfData.status || "").toLowerCase();
  const stare = stareRaw.includes("radia") ? "radiata" as const
    : stareRaw.includes("dizolv") ? "dizolvata" as const
    : stareRaw.includes("lichid") ? "lichidare" as const
    : "functiune" as const;

  // Extract capital social from balance sheet if available
  const balance = lfData.balance || {};
  const capitalSocial = balance.CapitalSocial || balance.capitalSocial || balance.Capital || undefined;

  // Derive status flags from company status text
  const statusLower = (lfData.status || "").toLowerCase();

  // Build raw data using keys the frontend expects + all extra ListaFirme fields
  const rawData = {
    ...lfData.raw,
    source: "listafirme",
    // Keys the frontend reads directly:
    caenDesc: lfData.naceDescription || "",
    activitatiSecundare: lfData.naceSecondary || [],
    insolventa: statusLower.includes("insolv"),
    dizolvare: statusLower.includes("dizolv"),
    lichidare: statusLower.includes("lichid"),
    restrictii: false,
    // Extra ListaFirme fields:
    vat: lfData.vat || "",
    foundedDate: lfData.foundedDate || "",
    townCode: lfData.townCode || "",
    balance: lfData.balance || null,
  };

  return db.transaction(async (tx) => {
    const [comp] = await tx.insert(companies).values({
      organizationId,
      formaJuridica: formaCode as FormaJuridica,
      denumire: lfData.name,
      cui: lfData.taxCode,
      regCom: lfData.regNo || undefined,
      adresa: lfData.address || undefined,
      localitate: lfData.city || undefined,
      judet: lfData.county || undefined,
      codPostal: lfData.townCode || undefined,
      telefon: lfData.phone || undefined,
      email: lfData.email || undefined,
      website: lfData.web || undefined,
      caen: lfData.nace || undefined,
      stare,
      anInfiintare: foundedYear,
      capitalSocial: capitalSocial ? capitalSocial.toString() : undefined,
      onrcRawData: rawData,
      lastSyncedAt: new Date(),
      createdBy: userId,
    }).returning();

    // Shareholders → company_associates
    if (lfData.shareholders?.length) {
      await tx.insert(companyAssociates).values(
        lfData.shareholders.map((s) => ({
          companyId: comp.id,
          type: "pf" as const,
          name: s.name,
          role: "Asociat",
          contribution: s.value || undefined,
          shares: s.shares ? parseInt(s.shares) || undefined : undefined,
        }))
      );
    }

    // Administrators → company_administrators
    if (lfData.administrators?.length) {
      await tx.insert(companyAdministrators).values(
        lfData.administrators.map((a) => ({
          companyId: comp.id,
          name: a.name,
          role: a.role || "Administrator",
          appointmentDate: a.since || undefined,
        }))
      );
    }

    // Financials from turnover/profit/employees + balance sheet
    if (lfData.turnover != null || lfData.profit != null || lfData.employees != null || lfData.balance) {
      const year = new Date().getFullYear() - 1;
      const f20: Record<string, any> = {};
      const f30: Record<string, any> = {};
      const f10: Record<string, any> = {};

      if (lfData.turnover != null) f20.cifraAfaceriNeta = lfData.turnover;
      if (lfData.profit != null) f20.profitNet = lfData.profit;
      if (lfData.employees != null) f30.numarMediuSalariati = lfData.employees;

      // Extract balance sheet fields if available
      if (lfData.balance) {
        const b = lfData.balance;
        if (b.CapitaluriProprii || b.capitaluriProprii) f10.capitaluriProprii = b.CapitaluriProprii || b.capitaluriProprii;
        if (b.CapitalSocial || b.capitalSocial) f10.capitalSocial = b.CapitalSocial || b.capitalSocial;
        if (b.ActiveImobilizate || b.activeImobilizate) f10.activeImobilizate = b.ActiveImobilizate || b.activeImobilizate;
        if (b.ActiveCirculante || b.activeCirculante) f10.activeCirculante = b.ActiveCirculante || b.activeCirculante;
        if (b.DatoriiTotal || b.datoriiTotal) f10.datoriiTotal = b.DatoriiTotal || b.datoriiTotal;
        if (b.Venituri || b.venituri) f20.venituri = b.Venituri || b.venituri;
        if (b.Cheltuieli || b.cheltuieli) f20.cheltuieli = b.Cheltuieli || b.cheltuieli;
      }

      await tx.insert(companyFinancials).values({
        companyId: comp.id,
        year,
        source: "onrc" as const,
        ...(Object.keys(f20).length > 0 ? { f20 } : {}),
        ...(Object.keys(f30).length > 0 ? { f30 } : {}),
        ...(Object.keys(f10).length > 0 ? { f10 } : {}),
      });
    }

    return comp;
  });
}

export const companyRoutes = new Hono<AppEnv>();

// --- LIST COMPANIES ---
companyRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const [result, totalResult] = await Promise.all([
    db.query.companies.findMany({
      where: eq(companies.organizationId, auth.organizationId),
      orderBy: (companies, { desc }) => [desc(companies.updatedAt)],
      limit,
      offset,
    }),
    db.select({ count: count() }).from(companies).where(eq(companies.organizationId, auth.organizationId)),
  ]);

  const total = totalResult[0]?.count ?? 0;
  return c.json({ data: result, total, page, limit });
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
    processingStatus: company.processingStatus || "idle",
    processingError: company.processingError || null,
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
      formaJuridica: formaJuridica as FormaJuridica,
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
  const cleanCUI = body.cui.replace(/\D/g, "");

  // Check duplicate
  const existing = await db.query.companies.findFirst({
    where: and(
      eq(companies.cui, cleanCUI),
      eq(companies.organizationId, auth.organizationId),
    ),
  });
  if (existing) return c.json({ error: "Firma cu acest CUI există deja" }, 400);

  // Try ListaFirme first (most commonly configured), then ONRC as fallback
  let lfData = null;
  try {
    lfData = await lookupCUI_ListaFirme(cleanCUI, auth.organizationId);
  } catch (lfErr: any) {
    console.log("[companies/auto] ListaFirme unavailable:", lfErr.message);
  }

  if (lfData) {
    try {
      const company = await insertCompanyFromListaFirme(lfData, auth.organizationId!, auth.userId);
      populateCompanyElements(company.id, auth.organizationId!).catch((e: any) =>
        console.warn("[companies/auto-lf] companyElements:", e.message));
      return c.json(company, 201);
    } catch (err: any) {
      console.error("[companies/auto-lf] Transaction failed:", err.message);
      return c.json({ error: `Eroare la crearea firmei: ${err.message}` }, 500);
    }
  }

  // Fallback: Lookup ONRC
  let onrcData = null;
  try {
    onrcData = await lookupCUI(cleanCUI, auth.organizationId);
  } catch (onrcErr: any) {
    console.log("[companies/auto] ONRC unavailable:", onrcErr.message);
  }
  if (!onrcData) return c.json({ error: "CUI-ul nu a fost găsit. Verifică că ai o integrare API configurată (ListaFirme.ro sau ONRC) în Configurări." }, 404);

  // Determine forma juridica
  const formaCode = Object.entries(FORMA_MAP).find(([k]) => (onrcData.formaJuridica || "").includes(k))?.[1] || "SRL";

  // Insert company + related data in a single transaction
  const orgId = auth.organizationId!;
  try {
    const company = await db.transaction(async (tx) => {
      const [comp] = await tx.insert(companies).values({
        organizationId: orgId,
        formaJuridica: formaCode as FormaJuridica,
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

    // Populate company elements (fire-and-forget)
    populateCompanyElements(company.id, orgId).catch((e: any) =>
      console.warn("[companies/create] companyElements:", e.message));

    return c.json(company, 201);
  } catch (err: any) {
    console.error("[companies/create] Transaction failed:", err.message);
    return c.json({ error: `Eroare la crearea firmei: ${err.message}` }, 500);
  }
});

// --- SYNC / ACTUALIZARE CUI ---
companyRoutes.post("/:id/sync-onrc", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  // Try ListaFirme first, then ONRC as fallback
  let lfData = null;
  try {
    lfData = await lookupCUI_ListaFirme(company.cui, auth.organizationId!);
  } catch (e: any) {
    console.log("[sync] ListaFirme unavailable:", e.message);
  }

  if (lfData) {
    // Update from ListaFirme
    const formaRaw = (lfData.legalForm || "").toUpperCase();
    const syncFormaCode = Object.entries(FORMA_MAP).find(([k]) => formaRaw.includes(k))?.[1];
    const stareRaw = (lfData.status || "").toLowerCase();
    const syncStare = stareRaw.includes("radia") ? "radiata" as const
      : stareRaw.includes("dizolv") ? "dizolvata" as const
      : stareRaw.includes("lichid") ? "lichidare" as const
      : "functiune" as const;
    const foundedYear = lfData.foundedDate ? parseInt(lfData.foundedDate.slice(0, 4)) : undefined;
    const balance = lfData.balance || {};
    const capitalSocial = balance.CapitalSocial || balance.capitalSocial || balance.Capital || undefined;
    const statusLower = stareRaw;

    await db.update(companies).set({
      denumire: lfData.name || company.denumire,
      regCom: lfData.regNo || company.regCom,
      ...(syncFormaCode ? { formaJuridica: syncFormaCode as FormaJuridica } : {}),
      adresa: lfData.address || company.adresa,
      localitate: lfData.city || company.localitate,
      judet: lfData.county || company.judet,
      codPostal: lfData.townCode || company.codPostal,
      telefon: lfData.phone || company.telefon,
      email: lfData.email || company.email,
      website: lfData.web || company.website,
      caen: lfData.nace || company.caen,
      stare: syncStare,
      anInfiintare: foundedYear || company.anInfiintare,
      capitalSocial: capitalSocial?.toString() || company.capitalSocial,
      onrcRawData: {
        ...lfData.raw,
        source: "listafirme",
        caenDesc: lfData.naceDescription || "",
        activitatiSecundare: lfData.naceSecondary || [],
        insolventa: statusLower.includes("insolv"),
        dizolvare: statusLower.includes("dizolv"),
        lichidare: statusLower.includes("lichid"),
        restrictii: false,
        vat: lfData.vat || "",
        foundedDate: lfData.foundedDate || "",
        townCode: lfData.townCode || "",
        balance: lfData.balance || null,
      },
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(companies.id, id));

    // Replace associates + administrators
    await db.transaction(async (tx) => {
      if (lfData!.shareholders?.length) {
        await tx.delete(companyAssociates).where(eq(companyAssociates.companyId, id));
        await tx.insert(companyAssociates).values(
          lfData!.shareholders.map((s) => ({
            companyId: id,
            type: "pf" as const,
            name: s.name,
            role: "Asociat",
            contribution: s.value || undefined,
            shares: s.shares ? parseInt(s.shares) || undefined : undefined,
          }))
        );
      }
      if (lfData!.administrators?.length) {
        await tx.delete(companyAdministrators).where(eq(companyAdministrators.companyId, id));
        await tx.insert(companyAdministrators).values(
          lfData!.administrators.map((a) => ({
            companyId: id,
            name: a.name,
            role: a.role || "Administrator",
            appointmentDate: a.since || undefined,
          }))
        );
      }
    });

    // Update financials
    if (lfData.turnover != null || lfData.profit != null || lfData.employees != null || lfData.balance) {
      const year = new Date().getFullYear() - 1;
      const f20: Record<string, any> = {};
      const f30: Record<string, any> = {};
      const f10: Record<string, any> = {};
      if (lfData.turnover != null) f20.cifraAfaceriNeta = lfData.turnover;
      if (lfData.profit != null) f20.profitNet = lfData.profit;
      if (lfData.employees != null) f30.numarMediuSalariati = lfData.employees;
      if (lfData.balance) {
        const b = lfData.balance;
        if (b.CapitaluriProprii || b.capitaluriProprii) f10.capitaluriProprii = b.CapitaluriProprii || b.capitaluriProprii;
        if (b.ActiveImobilizate || b.activeImobilizate) f10.activeImobilizate = b.ActiveImobilizate || b.activeImobilizate;
        if (b.ActiveCirculante || b.activeCirculante) f10.activeCirculante = b.ActiveCirculante || b.activeCirculante;
        if (b.DatoriiTotal || b.datoriiTotal) f10.datoriiTotal = b.DatoriiTotal || b.datoriiTotal;
        if (b.Venituri || b.venituri) f20.venituri = b.Venituri || b.venituri;
        if (b.Cheltuieli || b.cheltuieli) f20.cheltuieli = b.Cheltuieli || b.cheltuieli;
      }
      const existingFin = await db.query.companyFinancials.findFirst({
        where: and(eq(companyFinancials.companyId, id), eq(companyFinancials.year, year)),
      });
      const finData = {
        source: "onrc" as const,
        ...(Object.keys(f20).length > 0 ? { f20 } : {}),
        ...(Object.keys(f30).length > 0 ? { f30 } : {}),
        ...(Object.keys(f10).length > 0 ? { f10 } : {}),
      };
      if (existingFin) {
        await db.update(companyFinancials).set(finData).where(eq(companyFinancials.id, existingFin.id));
      } else {
        await db.insert(companyFinancials).values({ companyId: id, year, ...finData });
      }
    }

    populateCompanyElements(id, auth.organizationId!).catch((e: any) =>
      console.warn("[companies/sync-lf] companyElements:", e.message));

    return c.json({ ok: true, message: "Sincronizare completă (ListaFirme)" });
  }

  // Fallback: ONRC
  let onrcData = null;
  try {
    onrcData = await lookupCUI(company.cui, auth.organizationId!);
  } catch (e: any) {
    console.log("[sync] ONRC unavailable:", e.message);
  }
  if (!onrcData) return c.json({ error: "Nu s-au putut actualiza datele. Verifică integrările API în Configurări." }, 404);

  // Determine forma juridica + stare
  const syncFormaCode = Object.entries(FORMA_MAP).find(([k]) => (onrcData.formaJuridica || "").includes(k))?.[1];
  const syncStareRaw = (onrcData.stare || "").toLowerCase();
  const syncStare = syncStareRaw.includes("radia") ? "radiata" as const
    : syncStareRaw.includes("dizolv") ? "dizolvata" as const
    : syncStareRaw.includes("lichid") ? "lichidare" as const
    : "functiune" as const;

  // Update ALL company fields from ONRC (overwrite with current data)
  await db.update(companies).set({
    denumire: onrcData.denumire,
    regCom: onrcData.regCom || company.regCom,
    euid: onrcData.euid || company.euid,
    ...(syncFormaCode ? { formaJuridica: syncFormaCode as FormaJuridica } : {}),
    adresa: onrcData.adresa,
    localitate: onrcData.localitate,
    judet: onrcData.judet,
    codPostal: onrcData.codPostal || company.codPostal,
    telefon: onrcData.telefon,
    email: onrcData.email,
    website: onrcData.website || company.website,
    caen: company.caen,
    stare: syncStare,
    durata: onrcData.durata || company.durata,
    anInfiintare: onrcData.anInfiintare || company.anInfiintare,
    capitalSocial: onrcData.capitalSocial?.toString() || company.capitalSocial,
    moneda: onrcData.moneda || company.moneda,
    partiSociale: onrcData.partiSociale ?? company.partiSociale,
    actiuni: onrcData.actiuni ?? company.actiuni,
    valoareParte: onrcData.valoareParte?.toString() || company.valoareParte,
    valoareActiune: onrcData.valoareActiune?.toString() || company.valoareActiune,
    naturaCapital: onrcData.naturaCapital || company.naturaCapital,
    onrcRawData: onrcData.rawData,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(companies.id, id));

  // Replace associates + administrators atomically (ONRC is authoritative source)
  const hasNewAssociates = onrcData.asociatiPF.length > 0 || onrcData.asociatiPJ.length > 0;
  const hasNewAdmins = onrcData.administratori.length > 0;

  if (hasNewAssociates || hasNewAdmins) {
    await db.transaction(async (tx) => {
      if (hasNewAssociates) {
        await tx.delete(companyAssociates).where(eq(companyAssociates.companyId, id));

        if (onrcData.asociatiPF.length > 0) {
          await tx.insert(companyAssociates).values(
            onrcData.asociatiPF.map(a => ({
              companyId: id,
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
              companyId: id,
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
      }

      if (hasNewAdmins) {
        await tx.delete(companyAdministrators).where(eq(companyAdministrators.companyId, id));
        await tx.insert(companyAdministrators).values(
          onrcData.administratori.map(a => ({
            companyId: id,
            name: a.nume,
            role: a.functie,
            powers: a.puteri,
            mandateDuration: a.durataMandatLabel,
            appointmentDate: a.dataNumirii,
          }))
        );
      }
    });
  }

  // Update/insert financials
  if (onrcData.situatiiFinanciare.length > 0) {
    for (const s of onrcData.situatiiFinanciare) {
      const existingFin = await db.query.companyFinancials.findFirst({
        where: and(eq(companyFinancials.companyId, id), eq(companyFinancials.year, s.an)),
      });
      const finData = {
        source: "onrc" as const,
        f20: { cifraAfaceriNeta: s.cifraAfaceri, profitNet: s.profitNet },
        f30: { numarMediuSalariati: s.angajati },
        f10: s.capitaluriProprii ? { capitaluriProprii: s.capitaluriProprii } : undefined,
        processedAt: new Date(),
      };
      if (existingFin) {
        await db.update(companyFinancials).set(finData).where(eq(companyFinancials.id, existingFin.id));
      } else {
        await db.insert(companyFinancials).values({ companyId: id, year: s.an, ...finData });
      }
    }
  }

  // Refresh company elements
  populateCompanyElements(id, auth.organizationId!).catch((e: any) =>
    console.warn("[companies/sync-onrc] companyElements:", e.message));

  return c.json({ ok: true, message: "Sincronizare completă (ONRC)" });
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
  if (!file) return c.json({ error: "Fișier obligatoriu" }, 400);
  // Year is optional — AI will detect it from PDF if not provided
  const yearRaw = formData.get("year") as string | null;
  const year = yearRaw ? parseInt(yearRaw) : 0;

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
    year, // 0 = auto-detect from PDF
    organizationId: auth.organizationId,
  });

  return c.json({ ok: true, year: year || "auto", processingStatus: "processing", message: "Fișier încărcat, se procesează în fundal..." });
});

// --- SEARCH CUI (ListaFirme.ro) ---
companyRoutes.get("/search-cui", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const query = c.req.query("q") || "";
  if (!query || query.length < 2) return c.json([]);

  try {
    const orgId = auth.organizationId!;
    // If query is numeric, treat as CUI lookup
    const isNumeric = /^\d+$/.test(query.replace(/\D/g, ""));
    if (isNumeric && query.replace(/\D/g, "").length >= 4) {
      const result = await lookupCUI_ListaFirme(query, orgId);
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
    const results = await searchCompany_ListaFirme(query, orgId);
    return c.json(results.slice(0, 10).map(r => ({
      name: r.name,
      fiscalCode: r.fiscalCode,
      county: r.county,
      source: "listafirme",
    })));
  } catch (err: any) {
    // If ListaFirme is not configured, return empty
    if (err.message?.includes("LISTAFIRME_API_KEY") || err.message?.includes("nu este configurat")) {
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

  // Lookup from ListaFirme (uses org-level API key if configured)
  const lfData = await lookupCUI_ListaFirme(cleanCUI, auth.organizationId!);
  if (!lfData) return c.json({ error: "CUI-ul nu a fost găsit pe ListaFirme.ro" }, 404);

  try {
    const company = await insertCompanyFromListaFirme(lfData, auth.organizationId!, auth.userId);
    populateCompanyElements(company.id, auth.organizationId!).catch((e: any) =>
      console.warn("[companies/from-listafirme] companyElements:", e.message));
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
const updateCompanySchema = z.object({
  denumire: z.string().min(1).max(500).optional(),
  formaJuridica: z.enum(["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"]).optional(),
  caen: z.string().max(10).optional().nullable(),
  adresa: z.string().max(500).optional().nullable(),
  localitate: z.string().max(200).optional().nullable(),
  judet: z.string().max(100).optional().nullable(),
  telefon: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  capitalSocial: z.string().max(50).optional().nullable(),
  moneda: z.string().max(10).optional().nullable(),
  partiSociale: z.number().int().optional().nullable(),
  valoareParte: z.string().max(50).optional().nullable(),
});

companyRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = updateCompanySchema.parse(await c.req.json());

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Not found" }, 404);

  const updateData: Record<string, any> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) updateData[key] = value;
  }

  const [updated] = await db.update(companies).set(updateData).where(eq(companies.id, id)).returning();

  // Refresh company elements
  populateCompanyElements(id, auth.organizationId!).catch((e: any) =>
    console.warn("[companies/update] companyElements:", e.message));

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
    await deleteFile(company.certificatFileId).catch((e: any) => console.warn("[companies] certificat file cleanup:", e.message));
  }

  // Delete R2 files: bilant PDFs
  const financials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, id),
  });
  for (const fin of financials) {
    if (fin.fileId) {
      await deleteFile(fin.fileId).catch((e: any) => console.warn("[companies] bilant file cleanup:", e.message));
    }
  }

  // Delete R2 files: Neemia-generated docs for all projects of this company
  const companyProjects = await db.query.projects.findMany({
    where: eq(projects.companyId, id),
    columns: { id: true },
  });
  if (companyProjects.length > 0) {
    const projectIds = companyProjects.map(p => p.id);
    const generatedDocs = await db.query.projectDocuments.findMany({
      where: inArray(projectDocuments.projectId, projectIds),
      columns: { generatedFileId: true },
    });
    for (const doc of generatedDocs) {
      if (doc.generatedFileId) {
        await deleteFile(doc.generatedFileId).catch((e: any) => console.warn("[companies] neemia file cleanup:", e.message));
      }
    }
  }

  // Cascade deletes handle associates, admins, financials, IF members, projects
  await db.delete(companies).where(eq(companies.id, id));

  return c.json({ ok: true });
});

// --- PRE-ELIGIBILITY CHECK ---
companyRoutes.post("/:id/pre-eligibility", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const body = await c.req.json();
  const { sessionFolderId } = body;
  if (!sessionFolderId) return c.json({ error: "sessionFolderId obligatoriu" }, 400);

  try {
    const result = await checkPreEligibility(
      id,
      sessionFolderId,
      auth.organizationId!,
    );
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// --- LIST SESSIONS (Program → Măsură → Sesiune hierarchy) ---
companyRoutes.get("/sessions/list", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  // Get all session folders with their parent hierarchy
  const sessions = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.organizationId, auth.organizationId),
      eq(documentFolders.type, "sesiune"),
    ),
  });

  // For each session, walk up to get masura → program names
  const result = [];
  for (const session of sessions) {
    let masuraName = "";
    let programName = "";

    // Get masura (parent of sesiune)
    if (session.parentId) {
      const masura = await db.query.documentFolders.findFirst({
        where: eq(documentFolders.id, session.parentId),
      });
      if (masura) {
        masuraName = masura.name;
        // Get program (parent of masura)
        if (masura.parentId) {
          const program = await db.query.documentFolders.findFirst({
            where: eq(documentFolders.id, masura.parentId),
          });
          if (program) programName = program.name;
        }
      }
    }

    // Count rules in this session's guides
    const guideFolders = await db.query.documentFolders.findMany({
      where: and(
        eq(documentFolders.parentId, session.id),
        eq(documentFolders.type, "ghiduri"),
      ),
    });
    let rulesCount = 0;
    for (const gf of guideFolders) {
      const docs = await db.query.documents.findMany({
        where: eq(documents.folderId, gf.id),
      });
      for (const doc of docs) {
        const docRules = await db.query.rules.findMany({
          where: eq(rules.documentId, doc.id),
        });
        rulesCount += docRules.length;
      }
    }

    result.push({
      id: session.id,
      name: session.name,
      masuraName,
      programName,
      fullPath: [programName, masuraName, session.name].filter(Boolean).join(" → "),
      rulesCount,
    });
  }

  return c.json(result);
});

// ============================================================
// COMPANY ELEMENTS — Biblioteca Elemente (CRUD)
// ============================================================

// --- GET elements for a company ---
companyRoutes.get("/:id/elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const companyId = c.req.param("id");

  // Verify company belongs to org
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.organizationId, auth.organizationId)),
  });
  if (!company) return c.json({ error: "Firma nu a fost gasita" }, 404);

  const elements = await db.query.companyElements.findMany({
    where: eq(companyElements.companyId, companyId),
    orderBy: (el, { asc }) => [asc(el.elementKey)],
  });

  // Enrich with field definitions (category, label, etc.)
  const enriched = elements.map(el => {
    const fieldDef = getFieldDef(el.elementKey);
    return {
      ...el,
      label: fieldDef?.label || el.elementKey,
      category: fieldDef?.category || "custom",
      dataType: fieldDef?.dataType || "text",
      unit: fieldDef?.unit || null,
      autoPopulated: fieldDef?.autoPopulated || false,
    };
  });

  return c.json({
    elements: enriched,
    fieldCategories: FIELD_CATEGORIES,
    knownFields: KNOWN_COMPANY_FIELDS,
  });
});

// --- ADD / UPDATE a single element ---
companyRoutes.put("/:id/elements", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const companyId = c.req.param("id");

  const body = await c.req.json();
  const schema = z.object({
    elementKey: z.string().min(1).max(255),
    value: z.string().nullable(),
    label: z.string().optional(),
    source: z.enum(["manual", "solomon", "consultant_manual", "derived"]).default("manual"),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Date invalide", details: parsed.error.flatten() }, 400);

  // Verify company belongs to org
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.organizationId, auth.organizationId)),
  });
  if (!company) return c.json({ error: "Firma nu a fost gasita" }, 404);

  const { elementKey, value, source } = parsed.data;

  // Normalize the key via alias map
  const canonicalKey = resolveFieldKey(elementKey);

  // Upsert element
  const existing = await db.query.companyElements.findFirst({
    where: and(
      eq(companyElements.companyId, companyId),
      eq(companyElements.elementKey, canonicalKey),
    ),
  });

  if (existing) {
    await db.update(companyElements).set({
      value: value || null,
      source,
      updatedAt: new Date(),
    }).where(eq(companyElements.id, existing.id));
  } else {
    await db.insert(companyElements).values({
      companyId,
      organizationId: auth.organizationId,
      elementKey: canonicalKey,
      value: value || null,
      source,
    });
  }

  return c.json({ ok: true, elementKey: canonicalKey });
});

// --- BULK UPDATE elements ---
companyRoutes.put("/:id/elements/bulk", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const companyId = c.req.param("id");

  const body = await c.req.json();
  const schema = z.object({
    elements: z.array(z.object({
      elementKey: z.string().min(1).max(255),
      value: z.string().nullable(),
      source: z.enum(["manual", "solomon", "consultant_manual", "derived"]).default("manual"),
    })),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Date invalide", details: parsed.error.flatten() }, 400);

  // Verify company belongs to org
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.organizationId, auth.organizationId)),
  });
  if (!company) return c.json({ error: "Firma nu a fost gasita" }, 404);

  let updated = 0;
  let created = 0;

  for (const el of parsed.data.elements) {
    const canonicalKey = resolveFieldKey(el.elementKey);
    const existing = await db.query.companyElements.findFirst({
      where: and(
        eq(companyElements.companyId, companyId),
        eq(companyElements.elementKey, canonicalKey),
      ),
    });

    if (existing) {
      await db.update(companyElements).set({
        value: el.value || null,
        source: el.source,
        updatedAt: new Date(),
      }).where(eq(companyElements.id, existing.id));
      updated++;
    } else {
      await db.insert(companyElements).values({
        companyId,
        organizationId: auth.organizationId,
        elementKey: canonicalKey,
        value: el.value || null,
        source: el.source,
      });
      created++;
    }
  }

  return c.json({ ok: true, updated, created });
});

// --- DELETE a single element ---
companyRoutes.delete("/:id/elements/:elementId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const companyId = c.req.param("id");
  const elementId = c.req.param("elementId");

  // Verify company belongs to org
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.organizationId, auth.organizationId)),
  });
  if (!company) return c.json({ error: "Firma nu a fost gasita" }, 404);

  // Verify element belongs to this company
  const element = await db.query.companyElements.findFirst({
    where: and(
      eq(companyElements.id, elementId),
      eq(companyElements.companyId, companyId),
    ),
  });
  if (!element) return c.json({ error: "Element negasit" }, 404);

  await db.delete(companyElements).where(eq(companyElements.id, elementId));
  return c.json({ ok: true });
});

// --- GET known field definitions (for UI field picker) ---
companyRoutes.get("/field-definitions", async (c) => {
  return c.json({
    fields: KNOWN_COMPANY_FIELDS,
    categories: FIELD_CATEGORIES,
  });
});

// ─── LINKED COMPANIES ───

companyRoutes.post("/:id/linked-companies/analyze", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const id = c.req.param("id");

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId)),
  });
  if (!company) return c.json({ error: "Firma nu a fost găsită" }, 404);

  try {
    const { analyzeLinkedCompanies } = await import("../services/linkedCompanies");
    const result = await analyzeLinkedCompanies(id, auth.organizationId);
    return c.json(result);
  } catch (err: any) {
    console.error(`[linked-companies] Analysis failed for ${id}:`, err.message);
    return c.json({ error: err.message || "Eroare la verificare firme legate" }, 500);
  }
});

companyRoutes.get("/:id/linked-companies", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const id = c.req.param("id");

  const { companyLinkedCompanies } = await import("../db/schema");
  const links = await db.query.companyLinkedCompanies.findMany({
    where: and(
      eq(companyLinkedCompanies.companyId, id),
      eq(companyLinkedCompanies.organizationId, auth.organizationId),
    ),
    orderBy: (l, { desc }) => [desc(l.riskScore)],
  });

  return c.json(links);
});

companyRoutes.post("/:id/linked-companies/manual", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const id = c.req.param("id");

  const body = z.object({
    linkedCui: z.string().optional().default(""),
    linkedName: z.string().min(1),
    personName: z.string().min(1),
    personRoleMain: z.string().optional(),
    notes: z.string().optional(),
  }).parse(await c.req.json());

  const { companyLinkedCompanies } = await import("../db/schema");
  const [created] = await db.insert(companyLinkedCompanies).values({
    companyId: id,
    organizationId: auth.organizationId,
    linkedCui: body.linkedCui,
    linkedName: body.linkedName,
    personName: body.personName,
    personRoleMain: body.personRoleMain || null,
    riskScore: 50, // manual entries default to medium risk
    riskFlags: ["Adăugat manual de consultant"],
    source: "manual",
    notes: body.notes || null,
  }).returning();

  return c.json(created, 201);
});

companyRoutes.patch("/:id/linked-companies/:linkId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const linkId = c.req.param("linkId");
  const body = z.object({
    confirmed: z.boolean().optional(),
    dismissed: z.boolean().optional(),
    notes: z.string().optional(),
  }).parse(await c.req.json());

  const { companyLinkedCompanies } = await import("../db/schema");
  const updates: Record<string, any> = {};
  if (body.confirmed !== undefined) {
    updates.confirmed = body.confirmed;
    if (body.confirmed) updates.dismissed = false;
  }
  if (body.dismissed !== undefined) {
    updates.dismissed = body.dismissed;
    if (body.dismissed) updates.confirmed = false;
  }
  if (body.notes !== undefined) updates.notes = body.notes;

  await db.update(companyLinkedCompanies)
    .set(updates)
    .where(and(eq(companyLinkedCompanies.id, linkId), eq(companyLinkedCompanies.organizationId, auth.organizationId)));

  return c.json({ ok: true });
});

companyRoutes.delete("/:id/linked-companies/:linkId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const linkId = c.req.param("linkId");
  const { companyLinkedCompanies } = await import("../db/schema");
  await db.delete(companyLinkedCompanies).where(
    and(
      eq(companyLinkedCompanies.id, linkId),
      eq(companyLinkedCompanies.organizationId, auth.organizationId),
    ),
  );

  return c.json({ ok: true });
});
