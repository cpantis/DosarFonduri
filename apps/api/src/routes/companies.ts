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
import { uploadFile, getFileBuffer, deleteFile } from "../services/storage";
import { parseBilantPDF } from "../services/bilantParser";
import { extractTextFromPDF } from "../services/ocr";
import { extractCompanyFromDocument } from "../services/companyExtractor";
import { AuthContext } from "../middleware/auth";

// Helper: ensure processing_status columns exist (self-healing)
async function ensureProcessingColumns() {
  try {
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_status" varchar(20) DEFAULT 'idle'`);
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_error" text`);
  } catch { /* ignore */ }
}

// Background processor for PDF company extraction
async function processCompanyPDFInBackground(
  companyId: string,
  buffer: Buffer,
  organizationId: string,
) {
  try {
    const pdfText = await extractTextFromPDF(buffer);
    const companyData = await extractCompanyFromDocument(pdfText);

    if (!companyData) {
      await db.update(companies).set({
        processingStatus: "error",
        processingError: "Nu s-au putut extrage date din document.",
      }).where(eq(companies.id, companyId));
      return;
    }

    // Update company with extracted data
    const updateData: Record<string, any> = {
      processingStatus: "done",
      processingError: null,
    };
    if (companyData.denumire) updateData.denumire = companyData.denumire;
    if (companyData.cui) updateData.cui = companyData.cui;
    if (companyData.regCom) updateData.regCom = companyData.regCom;
    if (companyData.euid) updateData.euid = companyData.euid;
    if (companyData.adresa) updateData.adresa = companyData.adresa;
    if (companyData.localitate) updateData.localitate = companyData.localitate;
    if (companyData.judet) updateData.judet = companyData.judet;
    if (companyData.telefon) updateData.telefon = companyData.telefon;
    if (companyData.email) updateData.email = companyData.email;
    if (companyData.formaJuridica) updateData.formaJuridica = companyData.formaJuridica;
    if (companyData.stare) updateData.stare = companyData.stare;
    if (companyData.durata) updateData.durata = companyData.durata;
    if (companyData.anInfiintare) updateData.anInfiintare = companyData.anInfiintare;
    if (companyData.capitalSocial) updateData.capitalSocial = companyData.capitalSocial.toString();
    if (companyData.moneda) updateData.moneda = companyData.moneda;
    if (companyData.partiSociale) updateData.partiSociale = companyData.partiSociale;
    if (companyData.naturaCapital) updateData.naturaCapital = companyData.naturaCapital;
    if (companyData.caenPrincipal) updateData.caen = companyData.caenPrincipal;
    updateData.onrcRawData = companyData;

    await db.update(companies).set(updateData).where(eq(companies.id, companyId));

    // Insert associates
    if (companyData.asociati?.length > 0) {
      await db.insert(companyAssociates).values(
        companyData.asociati.map((a: any) => ({
          companyId,
          type: a.type as any,
          name: a.name,
          role: a.role,
          citizenshipOrCountry: a.citizenship,
          contribution: a.contribution?.toString(),
          shares: a.shares,
          pctBenefits: a.pctBenefits?.toString(),
          pctLosses: a.pctLosses?.toString(),
        }))
      );
    }

    // Insert administrators
    if (companyData.administratori?.length > 0) {
      await db.insert(companyAdministrators).values(
        companyData.administratori.map((a: any) => ({
          companyId,
          name: a.name,
          role: a.role,
          powers: a.powers,
          mandateDuration: a.mandateDuration,
        }))
      );
    }

    // Insert financials
    if (companyData.financials?.length > 0) {
      await db.insert(companyFinancials).values(
        companyData.financials.map((f: any) => ({
          companyId,
          year: f.year,
          source: "onrc" as const,
          f10: { capitaluriProprii: f.capitaluriProprii, activeImobilizate: { total: f.activeImobilizate }, activeCirculante: { total: f.activeCirculante } },
          f20: { cifraAfaceriNeta: f.cifraAfaceri, profitBrut: f.profitBrut, profitNet: f.profitNet },
          f30: { numarMediuSalariati: f.angajati, numarEfectivSalariati: f.angajatiEfectiv },
        }))
      );
    }

    console.log(`[BG] Company ${companyId} PDF processing completed successfully`);
  } catch (err: any) {
    console.error(`[BG] Company ${companyId} PDF processing failed:`, err.message);
    await db.update(companies).set({
      processingStatus: "error",
      processingError: err.message?.substring(0, 500) || "Eroare la procesare",
    }).where(eq(companies.id, companyId)).catch(() => {});
  }
}

// Background processor for ONRC update
async function processOnrcUpdateInBackground(
  companyId: string,
  buffer: Buffer,
  organizationId: string,
) {
  try {
    const pdfText = await extractTextFromPDF(buffer);
    const companyData = await extractCompanyFromDocument(pdfText);

    if (!companyData) {
      await db.update(companies).set({
        processingStatus: "error",
        processingError: "Nu s-au putut extrage date din document.",
      }).where(eq(companies.id, companyId));
      return;
    }

    const updateData: Record<string, any> = {
      processingStatus: "done",
      processingError: null,
      lastSyncedAt: new Date(),
    };
    if (companyData.denumire) updateData.denumire = companyData.denumire;
    if (companyData.regCom) updateData.regCom = companyData.regCom;
    if (companyData.euid) updateData.euid = companyData.euid;
    if (companyData.adresa) updateData.adresa = companyData.adresa;
    if (companyData.localitate) updateData.localitate = companyData.localitate;
    if (companyData.judet) updateData.judet = companyData.judet;
    if (companyData.telefon) updateData.telefon = companyData.telefon;
    if (companyData.email) updateData.email = companyData.email;
    if (companyData.formaJuridica) updateData.formaJuridica = companyData.formaJuridica;
    if (companyData.stare) updateData.stare = companyData.stare;
    if (companyData.durata) updateData.durata = companyData.durata;
    if (companyData.anInfiintare) updateData.anInfiintare = companyData.anInfiintare;
    if (companyData.capitalSocial) updateData.capitalSocial = companyData.capitalSocial.toString();
    if (companyData.moneda) updateData.moneda = companyData.moneda;
    if (companyData.partiSociale) updateData.partiSociale = companyData.partiSociale;
    if (companyData.naturaCapital) updateData.naturaCapital = companyData.naturaCapital;
    if (companyData.caenPrincipal) updateData.caen = companyData.caenPrincipal;
    updateData.onrcRawData = companyData;

    await db.update(companies).set(updateData).where(eq(companies.id, companyId));

    // Replace associates
    if (companyData.asociati?.length > 0) {
      await db.delete(companyAssociates).where(eq(companyAssociates.companyId, companyId));
      await db.insert(companyAssociates).values(
        companyData.asociati.map((a: any) => ({
          companyId,
          type: a.type as any,
          name: a.name,
          role: a.role,
          citizenshipOrCountry: a.citizenship,
          contribution: a.contribution?.toString(),
          shares: a.shares,
          pctBenefits: a.pctBenefits?.toString(),
          pctLosses: a.pctLosses?.toString(),
        }))
      );
    }

    // Replace administrators
    if (companyData.administratori?.length > 0) {
      await db.delete(companyAdministrators).where(eq(companyAdministrators.companyId, companyId));
      await db.insert(companyAdministrators).values(
        companyData.administratori.map((a: any) => ({
          companyId,
          name: a.name,
          role: a.role,
          powers: a.powers,
          mandateDuration: a.mandateDuration,
        }))
      );
    }

    // Insert/update financials
    if (companyData.financials?.length > 0) {
      for (const f of companyData.financials) {
        const existing = await db.query.companyFinancials.findFirst({
          where: and(eq(companyFinancials.companyId, companyId), eq(companyFinancials.year, f.year)),
        });
        const finData = {
          source: "onrc" as const,
          f10: { capitaluriProprii: f.capitaluriProprii, activeImobilizate: { total: f.activeImobilizate }, activeCirculante: { total: f.activeCirculante } },
          f20: { cifraAfaceriNeta: f.cifraAfaceri, profitBrut: f.profitBrut, profitNet: f.profitNet },
          f30: { numarMediuSalariati: f.angajati, numarEfectivSalariati: f.angajatiEfectiv },
          processedAt: new Date(),
        };
        if (existing) {
          await db.update(companyFinancials).set(finData).where(eq(companyFinancials.id, existing.id));
        } else {
          await db.insert(companyFinancials).values({ companyId, year: f.year, ...finData });
        }
      }
    }

    console.log(`[BG] Company ${companyId} ONRC update completed successfully`);
  } catch (err: any) {
    console.error(`[BG] Company ${companyId} ONRC update failed:`, err.message);
    await db.update(companies).set({
      processingStatus: "error",
      processingError: err.message?.substring(0, 500) || "Eroare la procesare",
    }).where(eq(companies.id, companyId)).catch(() => {});
  }
}

// Background processor for bilant PDF
async function processBilantInBackground(
  companyId: string,
  fileId: string,
  buffer: Buffer,
  year: number,
) {
  try {
    const pdfText = await extractTextFromPDF(buffer);
    const parsed = await parseBilantPDF(pdfText, year);

    const existing = await db.query.companyFinancials.findFirst({
      where: and(eq(companyFinancials.companyId, companyId), eq(companyFinancials.year, year)),
    });

    if (existing) {
      await db.update(companyFinancials).set({
        source: "anaf_upload",
        fileId,
        f10: parsed.f10,
        f20: parsed.f20,
        f30: parsed.f30,
        f40: parsed.f40,
        processedAt: new Date(),
      }).where(eq(companyFinancials.id, existing.id));
    } else {
      await db.insert(companyFinancials).values({
        companyId,
        year,
        source: "anaf_upload",
        fileId,
        f10: parsed.f10,
        f20: parsed.f20,
        f30: parsed.f30,
        f40: parsed.f40,
        processedAt: new Date(),
      });
    }

    await db.update(companies).set({
      processingStatus: "done",
      processingError: null,
    }).where(eq(companies.id, companyId));

    console.log(`[BG] Company ${companyId} bilant ${year} processing completed`);
  } catch (err: any) {
    console.error(`[BG] Company ${companyId} bilant processing failed:`, err.message);
    await db.update(companies).set({
      processingStatus: "error",
      processingError: err.message?.substring(0, 500) || "Eroare la procesare bilant",
    }).where(eq(companies.id, companyId)).catch(() => {});
  }
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

    // Fire background processing — do NOT await
    processCompanyPDFInBackground(company.id, buffer, auth.organizationId).catch(err => {
      console.error("[BG] Unhandled error in company PDF processing:", err);
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

  // Insert company
  const [company] = await db.insert(companies).values({
    organizationId: auth.organizationId,
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

  // Insert PF associates
  if (onrcData.asociatiPF.length > 0) {
    await db.insert(companyAssociates).values(
      onrcData.asociatiPF.map(a => ({
        companyId: company.id,
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

  // Insert PJ associates
  if (onrcData.asociatiPJ.length > 0) {
    await db.insert(companyAssociates).values(
      onrcData.asociatiPJ.map(a => ({
        companyId: company.id,
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

  // Insert administrators
  if (onrcData.administratori.length > 0) {
    await db.insert(companyAdministrators).values(
      onrcData.administratori.map(a => ({
        companyId: company.id,
        name: a.nume,
        role: a.functie,
        powers: a.puteri,
        mandateDuration: a.durataMandatLabel,
        appointmentDate: a.dataNumirii,
      }))
    );
  }

  // Insert ONRC financials
  if (onrcData.situatiiFinanciare.length > 0) {
    await db.insert(companyFinancials).values(
      onrcData.situatiiFinanciare.map(s => ({
        companyId: company.id,
        year: s.an,
        source: "onrc" as const,
        f20: { cifraAfaceriNeta: s.cifraAfaceri, profitNet: s.profitNet },
        f30: { numarMediuSalariati: s.angajati },
        f10: s.capitaluriProprii ? { capitaluriProprii: s.capitaluriProprii } : undefined,
      }))
    );
  }

  return c.json(company, 201);
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

  // Fire background processing — do NOT await
  processBilantInBackground(id, fileId, buffer, year).catch(err => {
    console.error("[BG] Unhandled error in bilant processing:", err);
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

  // Map legal form
  const LISTAFIRME_FORMA_MAP: Record<string, string> = {
    "SRL": "SRL", "SA": "SA", "PFA": "PFA", "II": "II", "IF": "IF",
    "SNC": "SNC", "SCS": "SCS", "SCA": "SCA", "SC": "SC", "RA": "RA",
  };
  const formaRaw = (lfData.legalForm || "").toUpperCase();
  const formaCode = Object.entries(LISTAFIRME_FORMA_MAP).find(([k]) => formaRaw.includes(k))?.[1] || "SRL";

  // Parse founded year
  const foundedYear = lfData.foundedDate ? parseInt(lfData.foundedDate.slice(0, 4)) : undefined;

  // Insert company
  const [company] = await db.insert(companies).values({
    organizationId: auth.organizationId,
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
    onrcRawData: lfData.raw,
    lastSyncedAt: new Date(),
    createdBy: auth.userId,
  }).returning();

  // Insert administrators from ListaFirme
  if (lfData.administrators.length > 0) {
    await db.insert(companyAdministrators).values(
      lfData.administrators.map(a => ({
        companyId: company.id,
        name: a.name,
        role: a.role || "administrator",
        appointmentDate: a.since || undefined,
      }))
    );
  }

  // Insert shareholders as associates
  if (lfData.shareholders.length > 0) {
    await db.insert(companyAssociates).values(
      lfData.shareholders.map(s => ({
        companyId: company.id,
        type: "pf" as const,
        name: s.name,
        role: "asociat",
        shares: s.shares ? parseInt(s.shares.replace(/\D/g, "")) || undefined : undefined,
      }))
    );
  }

  // Insert financials if available
  if (lfData.turnover !== null || lfData.profit !== null) {
    const currentYear = new Date().getFullYear() - 1; // last reported year
    await db.insert(companyFinancials).values({
      companyId: company.id,
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

  return c.json(company, 201);
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

  // Fire background processing — do NOT await
  processOnrcUpdateInBackground(id, buffer, auth.organizationId!).catch(err => {
    console.error("[BG] Unhandled error in ONRC update:", err);
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
