import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  companies, companyAssociates, companyAdministrators,
  companyFinancials, companyIfMembers,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { lookupCUI, FORMA_MAP } from "../services/onrc";
import { uploadFile, getFileBuffer } from "../services/storage";
import { parseBilantPDF } from "../services/bilantParser";
import { extractTextFromPDF } from "../services/ocr";
import { extractCompanyFromDocument } from "../services/companyExtractor";
import { AuthContext } from "../middleware/auth";

export const companyRoutes = new Hono();

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
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) return c.json({ error: "Fișier lipsă" }, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId, auth.userId);

    // Extract text from PDF
    const pdfText = await extractTextFromPDF(buffer);

    // Extract company data with Claude
    const companyData = await extractCompanyFromDocument(pdfText);

    if (!companyData) {
      return c.json({ error: "Nu s-au putut extrage date din document. Asigură-te că PDF-ul conține un certificat constatator ONRC." }, 400);
    }

    // Check duplicate
    const existing = await db.query.companies.findFirst({
      where: and(
        eq(companies.cui, companyData.cui),
        eq(companies.organizationId, auth.organizationId),
      ),
    });
    if (existing) return c.json({ error: "Firma cu CUI " + companyData.cui + " există deja" }, 400);

    // Create company
    const [company] = await db.insert(companies).values({
      organizationId: auth.organizationId,
      formaJuridica: companyData.formaJuridica as any,
      denumire: companyData.denumire,
      cui: companyData.cui,
      regCom: companyData.regCom,
      euid: companyData.euid,
      adresa: companyData.adresa,
      localitate: companyData.localitate,
      judet: companyData.judet,
      telefon: companyData.telefon,
      email: companyData.email,
      stare: companyData.stare as any,
      durata: companyData.durata,
      anInfiintare: companyData.anInfiintare,
      capitalSocial: companyData.capitalSocial?.toString(),
      moneda: companyData.moneda,
      partiSociale: companyData.partiSociale,
      naturaCapital: companyData.naturaCapital,
      certificatFileId: fileId,
      createdBy: auth.userId,
    }).returning();

    // Insert associates
    if (companyData.asociati?.length > 0) {
      await db.insert(companyAssociates).values(
        companyData.asociati.map((a) => ({
          companyId: company.id,
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
        companyData.administratori.map((a) => ({
          companyId: company.id,
          name: a.name,
          role: a.role,
          powers: a.powers,
          mandateDuration: a.mandateDuration,
        }))
      );
    }

    // Insert financials from certificat constatator
    if (companyData.financials?.length > 0) {
      await db.insert(companyFinancials).values(
        companyData.financials.map((f) => ({
          companyId: company.id,
          year: f.year,
          source: "onrc" as const,
          f10: { capitaluriProprii: f.capitaluriProprii, activeImobilizate: { total: f.activeImobilizate }, activeCirculante: { total: f.activeCirculante } },
          f20: { cifraAfaceriNeta: f.cifraAfaceri, profitBrut: f.profitBrut, profitNet: f.profitNet },
          f30: { numarMediuSalariati: f.angajati, numarEfectivSalariati: f.angajatiEfectiv },
        }))
      );
    }

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

  const pdfText = await extractTextFromPDF(buffer);
  const parsed = await parseBilantPDF(pdfText, year);

  const existing = await db.query.companyFinancials.findFirst({
    where: and(eq(companyFinancials.companyId, id), eq(companyFinancials.year, year)),
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
      companyId: id,
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

  return c.json({ ok: true, year, parsed });
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

  await db.delete(companies).where(
    and(eq(companies.id, id), eq(companies.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});
