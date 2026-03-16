import { Worker, Job } from "bullmq";
import { db } from "../db";
import {
  companies, companyAssociates, companyAdministrators,
  companyFinancials,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF } from "../services/ocr";
import { extractCompanyFromDocument } from "../services/companyExtractor";
import { parseBilantPDF } from "../services/bilantParser";
import { publishEvent } from "../lib/sse";
import { redis } from "../lib/redis";

// --- Job payload types ---

export interface CompanyExtractPayload {
  type: "onrc-extract";
  companyId: string;
  fileId: string;
  organizationId: string;
}

export interface CompanyOnrcUpdatePayload {
  type: "onrc-update";
  companyId: string;
  fileId: string;
  organizationId: string;
}

export interface CompanyBilantPayload {
  type: "bilant-parse";
  companyId: string;
  fileId: string;
  year: number;
  organizationId: string;
}

export type ProcessCompanyPayload =
  | CompanyExtractPayload
  | CompanyOnrcUpdatePayload
  | CompanyBilantPayload;

// --- Handlers ---

async function handleOnrcExtract(job: Job<CompanyExtractPayload>) {
  const { companyId, fileId, organizationId } = job.data;

  const { buffer } = await getFileBuffer(fileId);
  await job.updateProgress(10);

  const pdfResult = await extractTextFromPDF(buffer);
  await job.updateProgress(40);

  if (pdfResult.hasScannedPages) {
    console.log(`[onrc-extract] Scanned PDF detected (${pdfResult.scannedPageCount}/${pdfResult.totalPages} pages) — using OpenAI fallback`);
  } else {
    console.log(`[onrc-extract] Native PDF (${pdfResult.totalPages} pages) — using regex parser (no AI)`);
  }

  const companyData = await extractCompanyFromDocument(pdfResult.text, pdfResult.hasScannedPages);
  await job.updateProgress(80);

  if (!companyData) {
    await db.update(companies).set({
      processingStatus: "error",
      processingError: "Nu s-au putut extrage date din document.",
    }).where(eq(companies.id, companyId));
    throw new Error("Nu s-au putut extrage date din documentul ONRC");
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
        tipAsociat: a.calitate || a.role,
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
        appointmentDate: a.appointmentDate,
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

  await job.updateProgress(100);

  // SSE notification
  await publishEvent(`org:${organizationId}:uploads`, "company_processed", {
    companyId,
    status: "done",
    denumire: companyData.denumire || null,
    cui: companyData.cui || null,
    message: `Firmă procesată: ${companyData.denumire || "necunoscută"}`,
  }).catch(() => {});

  return { companyId, status: "done", denumire: companyData.denumire };
}

async function handleOnrcUpdate(job: Job<CompanyOnrcUpdatePayload>) {
  const { companyId, fileId, organizationId } = job.data;

  const { buffer } = await getFileBuffer(fileId);
  await job.updateProgress(10);

  const pdfResult = await extractTextFromPDF(buffer);
  await job.updateProgress(40);

  const companyData = await extractCompanyFromDocument(pdfResult.text, pdfResult.hasScannedPages);
  await job.updateProgress(80);

  if (!companyData) {
    await db.update(companies).set({
      processingStatus: "error",
      processingError: "Nu s-au putut extrage date din document.",
    }).where(eq(companies.id, companyId));
    throw new Error("Nu s-au putut extrage date din documentul ONRC");
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
        tipAsociat: a.calitate || a.role,
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
        appointmentDate: a.appointmentDate,
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

  await job.updateProgress(100);

  // SSE notification
  await publishEvent(`org:${organizationId}:uploads`, "company_processed", {
    companyId,
    status: "done",
    denumire: companyData.denumire || null,
    cui: companyData.cui || null,
    message: `Date ONRC actualizate: ${companyData.denumire || "firmă"}`,
  }).catch(() => {});

  return { companyId, status: "done", denumire: companyData.denumire };
}

async function handleBilantParse(job: Job<CompanyBilantPayload>) {
  const { companyId, fileId, year, organizationId } = job.data;

  const { buffer } = await getFileBuffer(fileId);
  await job.updateProgress(10);

  const pdfResult = await extractTextFromPDF(buffer);
  await job.updateProgress(40);

  const parsed = await parseBilantPDF(pdfResult.text, year);
  await job.updateProgress(80);

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

  await job.updateProgress(100);

  // SSE notification
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  await publishEvent(`org:${organizationId}:uploads`, "company_processed", {
    companyId,
    status: "done",
    year,
    message: `Bilanț ${year} procesat pentru ${company?.denumire || "firmă"}`,
  }).catch(() => {});

  return { companyId, status: "done", year };
}

// --- Worker ---

export const processCompanyWorker = new Worker<ProcessCompanyPayload>(
  "process-company",
  async (job: Job<ProcessCompanyPayload>) => {
    console.log(`[process-company] Job ${job.id} started: ${job.data.type} for company ${job.data.companyId}`);

    try {
      switch (job.data.type) {
        case "onrc-extract":
          return await handleOnrcExtract(job as Job<CompanyExtractPayload>);
        case "onrc-update":
          return await handleOnrcUpdate(job as Job<CompanyOnrcUpdatePayload>);
        case "bilant-parse":
          return await handleBilantParse(job as Job<CompanyBilantPayload>);
        default:
          throw new Error(`Unknown company job type: ${(job.data as any).type}`);
      }
    } catch (err: any) {
      console.error(`[process-company] Job ${job.id} failed:`, err.message);

      // Mark company as error (unless it's a retryable failure and there are attempts left)
      const attemptsLeft = (job.opts.attempts || 4) - job.attemptsMade - 1;
      if (attemptsLeft <= 0) {
        await db.update(companies).set({
          processingStatus: "error",
          processingError: err.message?.substring(0, 500) || "Eroare la procesare",
        }).where(eq(companies.id, job.data.companyId)).catch(() => {});

        // SSE failure notification
        await publishEvent(`org:${job.data.organizationId}:uploads`, "company_processing_failed", {
          companyId: job.data.companyId,
          status: "error",
          message: `Eroare la procesare: ${err.message?.substring(0, 200) || "Eroare necunoscută"}`,
        }).catch(() => {});
      }

      throw err; // Re-throw for BullMQ retry logic
    }
  },
  {
    connection: redis as any,
    concurrency: 2, // Max 2 company extractions in parallel (rate limit protection)
  },
);

processCompanyWorker.on("completed", (job: Job<ProcessCompanyPayload>) => {
  console.log(`[process-company] Job ${job.id} completed: ${job.data.type}`);
});

processCompanyWorker.on("failed", (job: Job<ProcessCompanyPayload> | undefined, err: Error) => {
  if (job) {
    console.error(`[process-company] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
  }
});
