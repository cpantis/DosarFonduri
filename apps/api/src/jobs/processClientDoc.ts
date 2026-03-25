import { Worker, Job } from "bullmq";
import { db } from "../db";
import {
  documents, projects, projectElements, templateElements,
  documentFolders, elementAuditLog, projectEligibility,
  extractionCache, elementDefinitions, projectChecklist,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { encrypt } from "../lib/crypto";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, extractTextFromImage, extractTextFromDOC, classifyDocument, shouldPreStructure, preStructureClientText } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishEligibilityUpdated, publishScoreUpdated, publishFieldExtracted, publishExtractionStarted, publishChecklistUpdated } from "../lib/sse";
import { redis } from "../lib/redis";
import { validateElement, logElementChange } from "../services/elementValidation";
import { checkEligibility } from "../services/eligibility";
import { computeProjectScores } from "../services/scoring";
import type { ExtractionResult } from "../services/extractionTypes";
import { resolveFieldKeys, getExtractorVocabulary, upsertElementDefinition } from "../services/elementDefinitionService";

// Extractors
import { extractCompanyFromDocument } from "../services/companyExtractor";
import { parseBilantPDF } from "../services/bilantParser";
import { extractContract } from "../services/contractExtractor";
import { extractOferta } from "../services/ofertaExtractor";
import { extractRegistruImobilizari } from "../services/registruExtractor";
import { extractDocumentMediu } from "../services/mediuExtractor";
import { extractExtrasCont } from "../services/extrasContExtractor";
import { extractDeclaratie } from "../services/declaratieExtractor";
import { extractCertificatFiscal } from "../services/certificatFiscalExtractor";
import { extractCarteIdentitate, extractCarteIdentitateFromImage } from "../services/carteIdentitateExtractor";
import { extractFactura } from "../services/facturaExtractor";
import { extractDiploma } from "../services/diplomaExtractor";
import { extractActConstitutiv } from "../services/actConstitutivExtractor";
import { extractGeneric } from "../services/genericExtractor";

// ─── CHECKLIST AUTO-MATCH MAP ───
// Maps documentTypeClass values to ILIKE-style patterns for matching checklist item names.
export const CHECKLIST_TYPE_MAP: Record<string, string[]> = {
  certificat_constatator: ['%certificat%constatator%', '%extras%onrc%'],
  bilant_anaf: ['%situati%financiar%', '%bilant%', '%bilant%anaf%'],
  carte_identitate: ['%carte%identitate%', '%ci %', '%ci/%', '%buletin%'],
  diploma_studii: ['%diplom%', '%studii%'],
  oferta_pret: ['%ofert%pret%', '%ofert%furnizor%', '%oferta%'],
  certificat_fiscal: ['%certificat%fiscal%'],
  contract_arenda: ['%contract%arenda%', '%arenda%', '%concesiune%'],
  document_mediu: ['%mediu%', '%evaluare%impact%'],
  extras_cont: ['%extras%cont%', '%extras%bancar%'],
  declaratie_expert_contabil: ['%declarati%expert%', '%declarati%contabil%'],
  act_constitutiv: ['%act%constitutiv%', '%statut%societat%'],
  factura: ['%factura%proforma%', '%factura%'],
  statut: ['%statut%'],
  registru_imobilizari: ['%registru%', '%imobilizar%'],
  memoriu_template: [],
  cerere_finantare_template: [],
  anexa_b_template: [],
  anexa_c_template: [],
  guide: [],
  guide_annex_table: [],
  guide_annex_form: [],
  adeverinta: ['%adeverint%'],
  foto_echipament: ['%foto%', '%echipament%'],
  descriere_proiect: ['%descriere%proiect%'],
  other: [],
};

/**
 * Auto-match a processed document to an unchecked checklist item and mark it done.
 */
export async function autoMatchChecklist(
  projectId: string,
  documentId: string,
  documentTypeClass: string,
): Promise<{ matched: boolean; itemName?: string; itemId?: string }> {
  const patterns = CHECKLIST_TYPE_MAP[documentTypeClass] || [];
  if (patterns.length === 0) return { matched: false };

  // Query unchecked checklist items for this project
  const uncheckedItems = await db.select().from(projectChecklist)
    .where(and(
      eq(projectChecklist.projectId, projectId),
      eq(projectChecklist.done, false),
    ));

  // Find first matching item by name pattern (case-insensitive)
  for (const item of uncheckedItems) {
    const nameLower = item.name.toLowerCase();
    for (const pattern of patterns) {
      const parts = pattern.toLowerCase().split('%').filter(Boolean);
      const allMatch = parts.every(part => nameLower.includes(part));
      if (allMatch) {
        // Mark as done
        await db.update(projectChecklist)
          .set({ done: true })
          .where(eq(projectChecklist.id, item.id));

        console.log(`[AUTO-CHECKLIST] ${documentTypeClass} → "${item.name}" (project ${projectId})`);
        return { matched: true, itemName: item.name, itemId: item.id };
      }
    }
  }

  return { matched: false };
}

interface ProcessClientDocPayload {
  documentId: string;
  organizationId: string;
}

/**
 * Adapt companyExtractor output to the standardized ExtractionResult format.
 */
function adaptCompanyResult(data: Awaited<ReturnType<typeof extractCompanyFromDocument>>, rawText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];

  if (!data) {
    return { document_type: "certificat_constatator", extracted_fields: [], raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
  }

  if (data.denumire) fields.push({ field_key: "denumire_solicitant", field_value: data.denumire, confidence: 0.95, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.cui) fields.push({ field_key: "cui", field_value: data.cui, confidence: 0.95, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.regCom) fields.push({ field_key: "nr_inmatriculare", field_value: data.regCom, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.formaJuridica) fields.push({ field_key: "forma_juridica", field_value: data.formaJuridica, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.caenPrincipal) fields.push({ field_key: "caen_principal", field_value: data.caenPrincipal, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.activitatiSecundare?.length) fields.push({ field_key: "caen_secundare", field_value: data.activitatiSecundare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.adresa) fields.push({ field_key: "adresa_sediu", field_value: data.adresa, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.localitate) fields.push({ field_key: "localitate", field_value: data.localitate, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.judet) fields.push({ field_key: "judet", field_value: data.judet, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.stare) fields.push({ field_key: "stare_firma", field_value: data.stare, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.capitalSocial) fields.push({ field_key: "capital_social", field_value: data.capitalSocial, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.anInfiintare) fields.push({ field_key: "data_inregistrare", field_value: data.anInfiintare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  // Fields previously lost at Layer 3 — now mapped properly
  if (data.euid) fields.push({ field_key: "euid", field_value: data.euid, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.telefon) fields.push({ field_key: "telefon", field_value: data.telefon, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.email) fields.push({ field_key: "email", field_value: data.email, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.durata) fields.push({ field_key: "durata_societate", field_value: data.durata, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.moneda) fields.push({ field_key: "moneda_capital", field_value: data.moneda, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.partiSociale != null) fields.push({ field_key: "parti_sociale", field_value: data.partiSociale, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.naturaCapital) fields.push({ field_key: "natura_capital", field_value: data.naturaCapital, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.caenDesc) fields.push({ field_key: "caen_descriere", field_value: data.caenDesc, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.sediiSecundare?.length) fields.push({ field_key: "sedii_secundare", field_value: data.sediiSecundare, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });

  // Structured sub-entities (prefixed with _ to signal raw/complex data)
  if (data.asociati?.length) fields.push({ field_key: "_raw_asociati", field_value: data.asociati, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.administratori?.length) fields.push({ field_key: "_raw_administratori", field_value: data.administratori, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.financials?.length) fields.push({ field_key: "_raw_financials", field_value: data.financials, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  // Extract individual financial years as top-level fields (not just _raw)
  if (data.financials?.length) {
    for (const fin of data.financials) {
      if (!fin.year) continue;
      const y = fin.year;
      if (fin.cifraAfaceri != null) fields.push({ field_key: `cifra_afaceri_${y}`, field_value: fin.cifraAfaceri, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (fin.profitBrut != null) fields.push({ field_key: `profit_brut_${y}`, field_value: fin.profitBrut, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (fin.profitNet != null) fields.push({ field_key: `profit_net_${y}`, field_value: fin.profitNet, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (fin.angajati != null) fields.push({ field_key: `numar_angajati_${y}`, field_value: fin.angajati, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (fin.capitaluriProprii != null) fields.push({ field_key: `capitaluri_proprii_${y}`, field_value: fin.capitaluriProprii, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (fin.activeImobilizate != null) fields.push({ field_key: `active_imobilizate_${y}`, field_value: fin.activeImobilizate, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    }
  }

  return { document_type: "certificat_constatator", extracted_fields: fields, raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
}

/**
 * Adapt bilantParser output to the standardized ExtractionResult format.
 */
function adaptBilantResult(data: Awaited<ReturnType<typeof parseBilantPDF>>, rawText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const year = data.year;

  // F20 — Profit & Loss (all fields)
  if (data.f20?.cifraAfaceriNeta != null) fields.push({ field_key: `cifra_afaceri_${year}`, field_value: data.f20.cifraAfaceriNeta, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitNet != null) fields.push({ field_key: `profit_net_${year}`, field_value: data.f20.profitNet, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitBrut != null) fields.push({ field_key: `profit_brut_${year}`, field_value: data.f20.profitBrut, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitExploatare != null) fields.push({ field_key: `profit_exploatare_${year}`, field_value: data.f20.profitExploatare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.venituriExploatare != null) fields.push({ field_key: `venituri_exploatare_${year}`, field_value: data.f20.venituriExploatare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.cheltuieliExploatare != null) fields.push({ field_key: `cheltuieli_exploatare_${year}`, field_value: data.f20.cheltuieliExploatare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.venituriTotale != null) fields.push({ field_key: `venituri_totale_${year}`, field_value: data.f20.venituriTotale, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.cheltuieliTotale != null) fields.push({ field_key: `cheltuieli_totale_${year}`, field_value: data.f20.cheltuieliTotale, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.impozitProfit != null) fields.push({ field_key: `impozit_profit_${year}`, field_value: data.f20.impozitProfit, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  // F10 — Balance sheet (totals and components)
  if (data.f10?.activeImobilizate?.total != null) {
    const activeTotale = (data.f10.activeImobilizate.total || 0) + (data.f10.activeCirculante?.total || 0);
    fields.push({ field_key: `active_totale_${year}`, field_value: activeTotale, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: `active_imobilizate_${year}`, field_value: data.f10.activeImobilizate.total, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  }
  if (data.f10?.activeCirculante?.total != null) fields.push({ field_key: `active_circulante_${year}`, field_value: data.f10.activeCirculante.total, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.activeCirculante?.stocuri != null) fields.push({ field_key: `stocuri_${year}`, field_value: data.f10.activeCirculante.stocuri, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.activeCirculante?.creante != null) fields.push({ field_key: `creante_${year}`, field_value: data.f10.activeCirculante.creante, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.activeCirculante?.casa != null) fields.push({ field_key: `casa_conturi_${year}`, field_value: data.f10.activeCirculante.casa, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.capitaluriProprii != null) fields.push({ field_key: `capitaluri_proprii_${year}`, field_value: data.f10.capitaluriProprii, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.capital?.subscrisVarsat != null) fields.push({ field_key: `capital_subscris_varsat_${year}`, field_value: data.f10.capital.subscrisVarsat, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.capital?.rezerve != null) fields.push({ field_key: `rezerve_${year}`, field_value: data.f10.capital.rezerve, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  // Datorii (short-term + long-term)
  if (data.f10?.datoriiSubAnul != null) fields.push({ field_key: `datorii_sub_an_${year}`, field_value: data.f10.datoriiSubAnul, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.datoriiPesteAnul != null) fields.push({ field_key: `datorii_peste_an_${year}`, field_value: data.f10.datoriiPesteAnul, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.datoriiSubAnul != null || data.f10?.datoriiPesteAnul != null) {
    const datorii = (data.f10.datoriiSubAnul || 0) + (data.f10.datoriiPesteAnul || 0);
    fields.push({ field_key: `datorii_totale_${year}`, field_value: datorii, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  }

  // F30 — Informative data
  if (data.f30?.numarMediuSalariati != null) fields.push({ field_key: `numar_angajati_${year}`, field_value: data.f30.numarMediuSalariati, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f30?.numarEfectivSalariati != null) fields.push({ field_key: `numar_angajati_efectiv_${year}`, field_value: data.f30.numarEfectivSalariati, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  // F40 — Fixed assets (immobilizations)
  if (data.f40?.totalCorporale) {
    const f40 = data.f40.totalCorporale;
    if (f40.soldInitial != null) fields.push({ field_key: `imobilizari_sold_initial_${year}`, field_value: f40.soldInitial, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (f40.cresteri != null) fields.push({ field_key: `imobilizari_cresteri_${year}`, field_value: f40.cresteri, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (f40.reduceri != null) fields.push({ field_key: `imobilizari_reduceri_${year}`, field_value: f40.reduceri, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (f40.soldFinal != null) fields.push({ field_key: `imobilizari_sold_final_${year}`, field_value: f40.soldFinal, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  }
  if (data.f40?.amortizareTotal != null) fields.push({ field_key: `amortizare_totala_${year}`, field_value: data.f40.amortizareTotal, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  fields.push({ field_key: `an_fiscal`, field_value: year, confidence: 0.95, source_page: 1, extraction_method: "ai_sonnet" });
  fields.push({ field_key: `_raw_bilant_${year}`, field_value: data, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  return { document_type: "bilant_anaf", extracted_fields: fields, raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
}

/**
 * Detect the fiscal year from bilanț text. Falls back to current year - 1.
 */
function detectBilantYear(text: string): number {
  const yearPatterns = [
    /anul\s+fiscal?\s+(\d{4})/i,
    /pentru\s+anul\s+(\d{4})/i,
    /ANUL\s+(\d{4})/,
    /31[./]12[./](\d{4})/,
    /exerci[țt]iul\s+financiar\s+(\d{4})/i,
    // XFA tag-style format: "An_r: 2023" or "an_r:2023" or "AnRaportare: 2023"
    /[Aa]n[_\s]?[Rr](?:aportare)?[:\s]+(\d{4})/,
    // XFA: "perioadaRaportare: 2023" or "DataRaportare_luna: 12" + "DataRaportare_an: 2023"
    /[Dd]ata[Rr]aportare[_\s]?[Aa]n[:\s]+(\d{4})/,
    // Filename pattern: _2023_12 or _2023_
    /_(\d{4})_\d{1,2}/,
  ];

  for (const pattern of yearPatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 2015 && year <= new Date().getFullYear()) return year;
    }
  }

  return new Date().getFullYear() - 1;
}

/**
 * P3 fix: Detect whether a "template" document actually contains filled-in data.
 * Templates typically have {{placeholders}} or empty fields. A filled document
 * has real company names, CUI numbers, specific amounts, etc.
 */
function isFilledTemplate(text: string): boolean {
  // If it has template placeholders, it's genuinely a template
  const placeholderPatterns = [/\{\{.+?\}\}/, /\[.*completați.*\]/i, /<.*completați.*>/i, /____+/];
  for (const p of placeholderPatterns) {
    if (p.test(text)) return false;
  }

  // Check for signs of filled-in data: CUI numbers, specific company names, amounts
  const filledIndicators = [
    /\bCUI[:\s]+\d{5,10}\b/i,        // CUI with actual number
    /\bS\.?R\.?L\.?\b/i,             // Company type
    /\b\d{1,3}([.,]\d{3})+\b/,       // Formatted amounts (1.000.000)
    /\bEUR\b|\bLEI\b|\bRON\b/i,      // Currency mentions
    /J\d+\/\d+\/\d{4}/,              // Registration number J2/1981/2017
  ];

  let filledCount = 0;
  for (const p of filledIndicators) {
    if (p.test(text)) filledCount++;
  }

  return filledCount >= 2; // At least 2 indicators of real data
}

/**
 * P4 fix: Detect compound documents that contain multiple sub-documents
 * (e.g., act constitutiv + certificat constatator in one PDF).
 *
 * Returns sub-document segments with page ranges and suggested types,
 * or null if the document appears to be a single document.
 */
interface SubDocument {
  startPage: number;
  endPage: number;
  text: string;
  suggestedType: string;
}

function detectCompoundDocument(text: string): SubDocument[] | null {
  // Split text by page markers
  const pagePattern = /--- Pagina (\d+).*?---\n/g;
  const pages: Array<{ page: number; text: string; startIdx: number }> = [];

  let match: RegExpExecArray | null;
  const matches: Array<{ page: number; idx: number }> = [];
  while ((match = pagePattern.exec(text)) !== null) {
    matches.push({ page: parseInt(match[1]), idx: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const endIdx = i + 1 < matches.length ? matches[i + 1].idx - (matches[i + 1].idx - text.lastIndexOf("---", matches[i + 1].idx)) : text.length;
    const pageText = text.slice(matches[i].idx, endIdx);
    pages.push({ page: matches[i].page, text: pageText, startIdx: matches[i].idx });
  }

  if (pages.length < 3) return null; // Too few pages to be compound

  // Look for document type boundaries — markers that indicate a new sub-document starts
  const docBoundaryMarkers = [
    { pattern: /CERTIFICAT\s+CONSTATATOR/i, type: "certificat_constatator" },
    { pattern: /ACT\s+CONSTITUTIV/i, type: "act_constitutiv" },
    { pattern: /STATUT(?:\s+SOCIETA)/i, type: "statut" },
    { pattern: /CERTIFICAT\s+DE\s+[ÎI]NREGISTRARE/i, type: "certificat_inregistrare" },
    { pattern: /REZOLU[ȚT]IE/i, type: "rezolutie" },
    { pattern: /HOT[ĂA]R[ÂA]RE\s+(?:AGA|ADUNARE)/i, type: "hotarare_aga" },
  ];

  // Find document boundaries
  const boundaries: Array<{ page: number; type: string }> = [];
  for (const p of pages) {
    // Only check the first 500 chars of each page (title/header area)
    const header = p.text.slice(0, 500);
    for (const marker of docBoundaryMarkers) {
      if (marker.pattern.test(header)) {
        boundaries.push({ page: p.page, type: marker.type });
        break;
      }
    }
  }

  // Also detect boundaries by CUI changes (different companies in same doc)
  const cuiPattern = /\bCUI[:\s]*(\d{5,10})\b/i;
  let lastCui: string | null = null;
  for (const p of pages) {
    const cuiMatch = p.text.match(cuiPattern);
    if (cuiMatch) {
      const cui = cuiMatch[1];
      if (lastCui && cui !== lastCui) {
        // CUI changed — this is a boundary between different companies
        const existing = boundaries.find(b => b.page === p.page);
        if (!existing) {
          boundaries.push({ page: p.page, type: "unknown_boundary" });
        }
      }
      lastCui = cui;
    }
  }

  if (boundaries.length < 2) return null; // Not compound (only one doc type found)

  // Build sub-documents from boundaries
  boundaries.sort((a, b) => a.page - b.page);
  const subDocs: SubDocument[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const startPage = boundaries[i].page;
    const endPage = i + 1 < boundaries.length ? boundaries[i + 1].page - 1 : pages[pages.length - 1].page;

    const subPages = pages.filter(p => p.page >= startPage && p.page <= endPage);
    const subText = subPages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");

    subDocs.push({
      startPage,
      endPage,
      text: subText,
      suggestedType: boundaries[i].type,
    });
  }

  // Include any pages before the first boundary as a separate sub-doc
  if (boundaries[0].page > 1) {
    const prePages = pages.filter(p => p.page < boundaries[0].page);
    if (prePages.length > 0) {
      const preText = prePages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
      subDocs.unshift({
        startPage: 1,
        endPage: boundaries[0].page - 1,
        text: preText,
        suggestedType: "unknown_preamble",
      });
    }
  }

  console.log(
    `[compoundDoc] Detected ${subDocs.length} sub-documents: ` +
    subDocs.map(s => `${s.suggestedType} (pp. ${s.startPage}-${s.endPage})`).join(", "),
  );

  return subDocs;
}

/**
 * Run the appropriate extractor based on document type.
 * Uses dedicated extractors for known types, falls back to the
 * generic AI extractor for any unrecognized type — so new document
 * types work immediately without code changes.
 */
async function runExtractor(
  documentType: string,
  text: string,
  vocabulary?: string[],
  pageImages?: Array<{ page: number; imageBase64: string }>,
): Promise<ExtractionResult | null> {
  const start = Date.now();

  switch (documentType) {
    case "certificat_constatator": {
      const data = await extractCompanyFromDocument(text);
      return adaptCompanyResult(data, text, Date.now() - start);
    }
    case "bilant_anaf": {
      const year = detectBilantYear(text);
      const data = await parseBilantPDF(text, year);
      return adaptBilantResult(data, text, Date.now() - start);
    }
    case "contract_arenda":
      return extractContract(text);
    case "oferta_pret":
      return extractOferta(text);
    case "registru_imobilizari":
      return extractRegistruImobilizari(text);
    case "document_mediu":
      return extractDocumentMediu(text);
    case "extras_cont":
      return extractExtrasCont(text);
    case "certificat_fiscal":
      return extractCertificatFiscal(text);
    case "declaratie_expert_contabil":
      return extractDeclaratie(text);
    case "carte_identitate": {
      // Vision-first: use page image directly if available (much better than OCR text for ID cards)
      if (pageImages && pageImages.length > 0) {
        console.log(`[processClientDoc] CI Vision-first extraction from page image (${pageImages.length} pages)`);
        return extractCarteIdentitateFromImage(pageImages[0].imageBase64, "image/png");
      }
      return extractCarteIdentitate(text);
    }
    case "factura":
      return extractFactura(text);
    case "diploma_studii":
      return extractDiploma(text);
    case "act_constitutiv":
      return extractActConstitutiv(text);
    default:
      // Generic AI extractor — handles any document type without a dedicated extractor.
      // Skips guides and templates (they have their own processing pipelines).
      if (documentType === "guide" || documentType.startsWith("guide_annex")) {
        return null;
      }
      // P3 fix: Templates with _template suffix are skipped UNLESS the text
      // contains filled-in data (no {{placeholders}}, but real company/project info).
      // This handles cases like "Template Memoriu.docx" which is actually a completed document.
      if (documentType.endsWith("_template")) {
        if (isFilledTemplate(text)) {
          console.log(`[runExtractor] "${documentType}" appears to be a filled-in document, extracting with generic`);
          return extractGeneric(text, documentType.replace("_template", "_filled"), vocabulary);
        }
        return null;
      }
      console.log(`[runExtractor] No dedicated extractor for "${documentType}", using generic AI extractor`);
      return extractGeneric(text, documentType, vocabulary);
  }
}

/**
 * Determine the AI model used by the extractor for cost logging.
 */
function getExtractorModel(documentType: string): string {
  switch (documentType) {
    case "document_mediu":
    case "extras_cont":
      return "claude-haiku-4-5-20251001";
    default:
      return "claude-sonnet-4-6-20250514";
  }
}

/**
 * Compute SHA-256 hash of document text content for cache dedup.
 */
function getContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const CACHE_MAX_AGE_DAYS = 30;

/**
 * Check extraction cache for a previously extracted result.
 * Returns cached ExtractionResult if found and not expired, null otherwise.
 */
async function checkCachedExtraction(
  contentHash: string,
  documentType: string,
  organizationId: string,
): Promise<ExtractionResult | null> {
  const cached = await db.query.extractionCache.findFirst({
    where: and(
      eq(extractionCache.contentHash, contentHash),
      eq(extractionCache.extractionType, documentType),
      eq(extractionCache.organizationId, organizationId),
    ),
  });

  if (!cached) return null;

  // Check expiry: expiresAt or 30-day max age
  const now = new Date();
  if (cached.expiresAt && cached.expiresAt < now) return null;

  const ageMs = now.getTime() - cached.createdAt.getTime();
  if (ageMs > CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;

  // Increment hit count
  await db.update(extractionCache)
    .set({ hitCount: sql`${extractionCache.hitCount} + 1` })
    .where(eq(extractionCache.id, cached.id));

  console.log(
    `[extractionCache] HIT for ${documentType} (hash=${contentHash.slice(0, 12)}…) ` +
    `— saved ~${cached.tokensUsed ?? "?"} tokens, model=${cached.modelUsed ?? "?"}`,
  );

  return cached.result as ExtractionResult;
}

/**
 * Save extraction result to cache for future dedup.
 */
async function saveToExtractionCache(
  contentHash: string,
  documentType: string,
  organizationId: string,
  result: ExtractionResult,
  textLength: number,
): Promise<void> {
  const modelUsed = getExtractorModel(documentType);
  const tokensEstimate = Math.min(Math.round(textLength / 4), 20000) + 2000;

  await db.insert(extractionCache).values({
    contentHash,
    organizationId,
    extractionType: documentType,
    result: result as any,
    modelUsed,
    tokensUsed: tokensEstimate,
    processingTimeMs: result.processing_time_ms,
    hitCount: 0,
  }).onConflictDoUpdate({
    target: [extractionCache.contentHash, extractionCache.extractionType, extractionCache.organizationId],
    set: {
      result: result as any,
      modelUsed,
      tokensUsed: tokensEstimate,
      processingTimeMs: result.processing_time_ms,
      createdAt: new Date(),
    },
  });
}

/**
 * Find the project associated with a document via folder hierarchy.
 * Documents are uploaded to a project's folder or a subfolder of it.
 */
async function findProjectForDocument(doc: { folderId: string; organizationId: string }) {
  // Direct match: project folder === document folder
  let project = await db.query.projects.findFirst({
    where: and(
      eq(projects.folderId, doc.folderId),
      eq(projects.organizationId, doc.organizationId),
    ),
  });
  if (project) return project;

  // Navigate up: document might be in a subfolder of the project's folder
  const folder = await db.query.documentFolders.findFirst({
    where: eq(documentFolders.id, doc.folderId),
  });
  if (folder?.parentId) {
    project = await db.query.projects.findFirst({
      where: and(
        eq(projects.folderId, folder.parentId),
        eq(projects.organizationId, doc.organizationId),
      ),
    });
    if (project) return project;

    // One more level up (e.g. document in session/clienti/subfolder)
    const parentFolder = await db.query.documentFolders.findFirst({
      where: eq(documentFolders.id, folder.parentId),
    });
    if (parentFolder?.parentId) {
      project = await db.query.projects.findFirst({
        where: and(
          eq(projects.folderId, parentFolder.parentId),
          eq(projects.organizationId, doc.organizationId),
        ),
      });
    }
  }

  return project ?? null;
}

/**
 * Find template elements matching a field key within the organization.
 * Searches in guide/template folders associated with the project's folder hierarchy.
 */
async function findTemplateElementByKey(
  fieldKey: string,
  organizationId: string,
  projectFolderId: string,
): Promise<{ id: string; key: string; fieldType: string } | null> {
  // Find guide/template folders under the project's folder
  const guideFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, projectFolderId),
      eq(documentFolders.organizationId, organizationId),
    ),
  });

  // Search template elements in docs from those folders
  for (const folder of guideFolders) {
    if (folder.type !== "ghiduri" && folder.type !== "templateuri") continue;

    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });

    for (const doc of docs) {
      const tmplEl = await db.query.templateElements.findFirst({
        where: and(
          eq(templateElements.documentId, doc.id),
          eq(templateElements.key, fieldKey),
        ),
      });
      if (tmplEl) return tmplEl;
    }
  }

  // Fallback: search all template elements in the org with this key
  const tmplEl = await db.query.templateElements.findFirst({
    where: and(
      eq(templateElements.organizationId, organizationId),
      eq(templateElements.key, fieldKey),
    ),
  });

  return tmplEl ?? null;
}

/**
 * Save extracted fields from document processing into project_elements.
 *
 * Resolution strategy (element_definitions as primary anchor):
 * 1. Batch-resolve all field keys against element_definitions (exact → normalized → fuzzy)
 * 2. For resolved keys: use elementDefId as anchor; also set templateElementId if available
 * 3. For unresolved keys: fall back to templateElements lookup (backward compat)
 * 4. Fields with no anchor at all are logged but not silently dropped
 *
 * Conflict resolution:
 * - No existing element → create with source 'document_extracted'
 * - Existing with source 'document_extracted' → update (newer doc wins), audit old value
 * - Existing with source 'solomon' or 'manual' → skip (don't overwrite consultant data),
 *   but log a warning for review
 */

/**
 * Known client document field definitions — auto-created when no matching
 * elementDefinition exists. Keyed by field_key from extractors.
 * Consultants have legal authorization (împuternicire) to process these documents.
 */
type FieldDefCategory = "beneficiary" | "farm" | "investment" | "location" | "financial" | "legal" | "technical" | "other";
type FieldDefDataType = "text" | "number" | "date";

const CLIENT_DOC_FIELD_DEFS: Record<string, {
  displayName: string;
  category: FieldDefCategory;
  dataType: FieldDefDataType;
  required?: boolean;
}> = {
  // ── Carte de identitate ──
  cnp: { displayName: "CNP reprezentant legal", category: "beneficiary", dataType: "text", required: true },
  serie_ci: { displayName: "Serie CI", category: "legal", dataType: "text", required: true },
  numar_ci: { displayName: "Număr CI", category: "legal", dataType: "text", required: true },
  nume: { displayName: "Nume reprezentant legal", category: "beneficiary", dataType: "text", required: true },
  prenume: { displayName: "Prenume reprezentant legal", category: "beneficiary", dataType: "text", required: true },
  cetatenie: { displayName: "Cetățenie", category: "beneficiary", dataType: "text" },
  loc_nastere: { displayName: "Localitate naștere", category: "beneficiary", dataType: "text" },
  judet_nastere: { displayName: "Județ naștere", category: "beneficiary", dataType: "text" },
  domiciliu: { displayName: "Adresă domiciliu", category: "location", dataType: "text", required: true },
  localitate_domiciliu: { displayName: "Localitate domiciliu", category: "location", dataType: "text", required: true },
  judet_domiciliu: { displayName: "Județ domiciliu", category: "location", dataType: "text", required: true },
  data_nastere: { displayName: "Data naștere", category: "beneficiary", dataType: "date", required: true },
  sex: { displayName: "Sex", category: "beneficiary", dataType: "text" },
  data_emitere_ci: { displayName: "Data emitere CI", category: "legal", dataType: "date", required: true },
  data_expirare_ci: { displayName: "Data expirare CI", category: "legal", dataType: "date", required: true },
  emitent_ci: { displayName: "Emitent CI (SPCLEP)", category: "legal", dataType: "text" },

  // ── Diplomă studii (keys match diplomaExtractor.ts exactly) ──
  tip_document_studii: { displayName: "Tip document studii", category: "beneficiary", dataType: "text" },
  institutie_studii: { displayName: "Instituție învățământ", category: "beneficiary", dataType: "text" },
  facultate: { displayName: "Facultate", category: "beneficiary", dataType: "text" },
  specializare_studii: { displayName: "Specializare studii", category: "beneficiary", dataType: "text" },
  nivel_studii: { displayName: "Nivel studii", category: "beneficiary", dataType: "text" },
  titlu_obtinut: { displayName: "Titlu obținut", category: "beneficiary", dataType: "text" },
  nume_titular_diploma: { displayName: "Nume titular diplomă", category: "beneficiary", dataType: "text" },
  cnp_titular_diploma: { displayName: "CNP titular diplomă", category: "beneficiary", dataType: "text" },
  data_absolvirii: { displayName: "Data absolvirii", category: "beneficiary", dataType: "date" },
  nr_diploma: { displayName: "Număr diplomă", category: "beneficiary", dataType: "text" },
  an_absolvire: { displayName: "An absolvire", category: "beneficiary", dataType: "text" },
  forma_invatamant: { displayName: "Formă învățământ", category: "beneficiary", dataType: "text" },
  media_absolvire: { displayName: "Medie absolvire", category: "beneficiary", dataType: "number" },

  // ── Certificat constatator (companyExtractor) ──
  denumire_solicitant: { displayName: "Denumire solicitant", category: "beneficiary", dataType: "text", required: true },
  cui: { displayName: "Cod unic de înregistrare (CUI)", category: "beneficiary", dataType: "text", required: true },
  nr_inmatriculare: { displayName: "Nr. înmatriculare ORC", category: "legal", dataType: "text", required: true },
  forma_juridica: { displayName: "Formă juridică", category: "legal", dataType: "text", required: true },
  caen_principal: { displayName: "Cod CAEN principal", category: "beneficiary", dataType: "text", required: true },
  caen_secundare: { displayName: "Coduri CAEN secundare", category: "beneficiary", dataType: "text" },
  caen_descriere: { displayName: "Descriere CAEN principal", category: "beneficiary", dataType: "text" },
  adresa_sediu: { displayName: "Adresă sediu social", category: "location", dataType: "text", required: true },
  localitate: { displayName: "Localitate sediu", category: "location", dataType: "text", required: true },
  judet: { displayName: "Județ sediu", category: "location", dataType: "text", required: true },
  stare_firma: { displayName: "Stare firmă", category: "legal", dataType: "text" },
  capital_social: { displayName: "Capital social", category: "financial", dataType: "number" },
  data_inregistrare: { displayName: "Data înregistrare", category: "legal", dataType: "date" },
  euid: { displayName: "EUID", category: "legal", dataType: "text" },
  telefon: { displayName: "Telefon", category: "beneficiary", dataType: "text" },
  email: { displayName: "Email", category: "beneficiary", dataType: "text" },
  durata_societate: { displayName: "Durată societate", category: "legal", dataType: "text" },
  moneda_capital: { displayName: "Monedă capital social", category: "financial", dataType: "text" },
  parti_sociale: { displayName: "Număr părți sociale", category: "financial", dataType: "number" },
  natura_capital: { displayName: "Natura capital", category: "financial", dataType: "text" },
  sedii_secundare: { displayName: "Sedii secundare", category: "location", dataType: "text" },

  // ── Certificat fiscal ──
  denumire_contribuabil: { displayName: "Denumire contribuabil", category: "beneficiary", dataType: "text" },
  cui_fiscal: { displayName: "CUI fiscal", category: "beneficiary", dataType: "text" },
  adresa_fiscala: { displayName: "Adresă fiscală", category: "location", dataType: "text" },
  nr_certificat_fiscal: { displayName: "Nr. certificat fiscal", category: "legal", dataType: "text" },
  data_emitere_certificat_fiscal: { displayName: "Data emitere certificat fiscal", category: "legal", dataType: "date" },
  data_valabilitate_certificat_fiscal: { displayName: "Data valabilitate certificat fiscal", category: "legal", dataType: "date" },
  emitent_certificat_fiscal: { displayName: "Emitent certificat fiscal", category: "legal", dataType: "text" },
  tip_emitent_certificat_fiscal: { displayName: "Tip emitent certificat fiscal", category: "legal", dataType: "text" },
  obligatii_restante: { displayName: "Obligații restante (da/nu)", category: "financial", dataType: "text", required: true },
  suma_restanta_fiscala: { displayName: "Sumă restantă fiscală", category: "financial", dataType: "number" },
  detalii_restante_fiscale: { displayName: "Detalii restanțe fiscale", category: "financial", dataType: "text" },
  tip_obligatii_fiscale: { displayName: "Tip obligații fiscale", category: "financial", dataType: "text" },
  scop_certificat_fiscal: { displayName: "Scop certificat fiscal", category: "legal", dataType: "text" },
  certificat_fiscal_valid: { displayName: "Certificat fiscal valid", category: "legal", dataType: "text" },
  certificat_fiscal_avertisment: { displayName: "Avertisment certificat fiscal", category: "legal", dataType: "text" },

  // ── Extras de cont ──
  banca: { displayName: "Bancă", category: "financial", dataType: "text" },
  sold_disponibil: { displayName: "Sold disponibil", category: "financial", dataType: "number" },
  data_extras: { displayName: "Data extras cont", category: "financial", dataType: "date" },
  moneda_extras: { displayName: "Monedă extras", category: "financial", dataType: "text" },
  iban: { displayName: "IBAN", category: "financial", dataType: "text" },
  titular_cont: { displayName: "Titular cont", category: "beneficiary", dataType: "text" },
  titular_cont_cui: { displayName: "CUI titular cont", category: "beneficiary", dataType: "text" },
  extras_zile_lucratoare_vechime: { displayName: "Vechime extras (zile lucrătoare)", category: "financial", dataType: "number" },
  extras_afir_valid: { displayName: "Extras valid AFIR", category: "financial", dataType: "text" },
  extras_avertisment: { displayName: "Avertisment extras cont", category: "financial", dataType: "text" },

  // ── Document mediu ──
  tip_document_mediu: { displayName: "Tip document mediu", category: "legal", dataType: "text" },
  numar_document_mediu: { displayName: "Nr. document mediu", category: "legal", dataType: "text" },
  data_emitere_mediu: { displayName: "Data emitere document mediu", category: "legal", dataType: "date" },
  emitent_mediu: { displayName: "Emitent document mediu", category: "legal", dataType: "text" },
  titular_mediu_nume: { displayName: "Titular document mediu", category: "beneficiary", dataType: "text" },
  titular_mediu_cui: { displayName: "CUI titular mediu", category: "beneficiary", dataType: "text" },
  proiect_mediu_denumire: { displayName: "Denumire proiect mediu", category: "technical", dataType: "text" },
  locatie_mediu: { displayName: "Locație document mediu", category: "location", dataType: "text" },

  // ── Declarație expert contabil ──
  ani_activitate_agroalimentara: { displayName: "Ani activitate agroalimentară", category: "financial", dataType: "number" },
  coduri_caen_activitate: { displayName: "Coduri CAEN activitate", category: "beneficiary", dataType: "text" },
  cifra_afaceri_agroalimentara: { displayName: "Cifra afaceri agroalimentară", category: "financial", dataType: "number" },
  cifra_afaceri_totala: { displayName: "Cifra afaceri totală", category: "financial", dataType: "number" },
  ponderea_venituri_agro_in_total: { displayName: "Ponderea veniturilor agro în total (%)", category: "financial", dataType: "number" },
  expert_contabil_nume: { displayName: "Expert contabil — nume", category: "legal", dataType: "text" },
  expert_contabil_autorizatie: { displayName: "Expert contabil — autorizație", category: "legal", dataType: "text" },
  data_declaratie_expert: { displayName: "Data declarație expert contabil", category: "legal", dataType: "date" },
  firma_nume: { displayName: "Denumire firmă (din declarație)", category: "beneficiary", dataType: "text" },
  firma_cui: { displayName: "CUI firmă (din declarație)", category: "beneficiary", dataType: "text" },

  // ── Contract / Arendă (static fields) ──
  tip_contract: { displayName: "Tip contract", category: "legal", dataType: "text" },
  nr_contract: { displayName: "Nr. contract", category: "legal", dataType: "text" },
  data_contract: { displayName: "Data contract", category: "legal", dataType: "date" },
  data_start_contract: { displayName: "Data start contract", category: "legal", dataType: "date" },
  data_sfarsit_contract: { displayName: "Data sfârșit contract", category: "legal", dataType: "date" },
  durata_contract: { displayName: "Durată contract", category: "legal", dataType: "text" },
  obiect_contract: { displayName: "Obiect contract", category: "legal", dataType: "text" },
  valoare_contract: { displayName: "Valoare contract", category: "financial", dataType: "number" },
  valoare_anuala_contract: { displayName: "Valoare anuală contract", category: "financial", dataType: "number" },
  moneda_contract: { displayName: "Monedă contract", category: "financial", dataType: "text" },
  modalitate_plata_contract: { displayName: "Modalitate plată contract", category: "financial", dataType: "text" },
  clauze_speciale_contract: { displayName: "Clauze speciale contract", category: "legal", dataType: "text" },
  contract_autentificat: { displayName: "Contract autentificat (da/nu)", category: "legal", dataType: "text" },
  notar_contract: { displayName: "Notar contract", category: "legal", dataType: "text" },
  arendas_nume: { displayName: "Nume arendaș", category: "beneficiary", dataType: "text" },
  arendas_cui: { displayName: "CUI arendaș", category: "beneficiary", dataType: "text" },
  suprafata_contracte: { displayName: "Suprafață totală contracte", category: "farm", dataType: "number" },
  numar_parcele: { displayName: "Număr parcele", category: "farm", dataType: "number" },

  // ── Ofertă preț (static fields) ──
  furnizor_nume: { displayName: "Furnizor — nume", category: "investment", dataType: "text" },
  furnizor_cui: { displayName: "Furnizor — CUI", category: "investment", dataType: "text" },
  total_oferta_eur: { displayName: "Total ofertă (EUR)", category: "investment", dataType: "number" },
  valabilitate_oferta: { displayName: "Valabilitate ofertă", category: "investment", dataType: "text" },
  data_oferta: { displayName: "Data ofertă", category: "investment", dataType: "date" },
  nr_oferta: { displayName: "Nr. ofertă", category: "investment", dataType: "text" },

  // ── Registru imobilizări (static fields) ──
  total_valoare_inventar: { displayName: "Total valoare inventar", category: "financial", dataType: "number" },
  total_amortizare: { displayName: "Total amortizare", category: "financial", dataType: "number" },
  data_registru: { displayName: "Data registru imobilizări", category: "financial", dataType: "date" },
  putere_tractoare_existente: { displayName: "Putere tractoare existente (CP)", category: "farm", dataType: "number" },
  putere_tractoare_excluse_8ani: { displayName: "Putere tractoare excluse >8 ani (CP)", category: "farm", dataType: "number" },
  tractoare_excluse_lista: { displayName: "Lista tractoare excluse >8 ani", category: "farm", dataType: "text" },

  // ── Factură (static fields) ──
  tip_factura: { displayName: "Tip factură", category: "financial", dataType: "text" },
  serie_numar_factura: { displayName: "Serie/număr factură", category: "financial", dataType: "text" },
  data_factura: { displayName: "Data factură", category: "financial", dataType: "date" },
  data_scadenta_factura: { displayName: "Data scadență factură", category: "financial", dataType: "date" },
  data_livrare_factura: { displayName: "Data livrare factură", category: "financial", dataType: "date" },
  furnizor_reg_com: { displayName: "Furnizor — reg. comerțului", category: "financial", dataType: "text" },
  furnizor_adresa: { displayName: "Furnizor — adresă", category: "financial", dataType: "text" },
  furnizor_banca: { displayName: "Furnizor — bancă", category: "financial", dataType: "text" },
  furnizor_iban: { displayName: "Furnizor — IBAN", category: "financial", dataType: "text" },
  cumparator_nume: { displayName: "Cumpărător — nume", category: "beneficiary", dataType: "text" },
  cumparator_cui: { displayName: "Cumpărător — CUI", category: "beneficiary", dataType: "text" },
  cumparator_reg_com: { displayName: "Cumpărător — reg. comerțului", category: "beneficiary", dataType: "text" },
  cumparator_adresa: { displayName: "Cumpărător — adresă", category: "beneficiary", dataType: "text" },
  total_fara_tva: { displayName: "Total fără TVA", category: "financial", dataType: "number" },
  total_tva: { displayName: "Total TVA", category: "financial", dataType: "number" },
  total_de_plata: { displayName: "Total de plată", category: "financial", dataType: "number" },
  moneda_factura: { displayName: "Monedă factură", category: "financial", dataType: "text" },
  curs_valutar: { displayName: "Curs valutar", category: "financial", dataType: "number" },
  modalitate_plata: { displayName: "Modalitate plată", category: "financial", dataType: "text" },
  termen_plata: { displayName: "Termen plată", category: "financial", dataType: "text" },
  observatii_factura: { displayName: "Observații factură", category: "financial", dataType: "text" },
  contract_referinta_factura: { displayName: "Contract referință factură", category: "financial", dataType: "text" },
  delegat_factura: { displayName: "Delegat factură", category: "financial", dataType: "text" },

  // ── Act constitutiv (static fields) ──
  denumire_societate: { displayName: "Denumire societate", category: "beneficiary", dataType: "text" },
  forma_juridica_ac: { displayName: "Formă juridică (act constitutiv)", category: "legal", dataType: "text" },
  sediu_social: { displayName: "Sediu social", category: "location", dataType: "text" },
  capital_social_ac: { displayName: "Capital social (act constitutiv)", category: "financial", dataType: "number" },
  nr_parti_sociale_ac: { displayName: "Nr. părți sociale (act constitutiv)", category: "financial", dataType: "number" },
  valoare_parte_sociala: { displayName: "Valoare parte socială", category: "financial", dataType: "number" },
  // durata_societate — already defined in certificat constatator section above
  caen_principal_ac: { displayName: "CAEN principal (act constitutiv)", category: "beneficiary", dataType: "text" },
  descriere_caen_principal_ac: { displayName: "Descriere CAEN principal", category: "beneficiary", dataType: "text" },
  obiecte_secundare_ac: { displayName: "Obiecte secundare activitate", category: "beneficiary", dataType: "text" },
  administrator_ac: { displayName: "Administrator", category: "beneficiary", dataType: "text" },
  clauze_cesiune: { displayName: "Clauze cesiune", category: "legal", dataType: "text" },
  clauze_retragere: { displayName: "Clauze retragere", category: "legal", dataType: "text" },
  clauze_dizolvare: { displayName: "Clauze dizolvare", category: "legal", dataType: "text" },
  restrictii_activitate: { displayName: "Restricții activitate", category: "legal", dataType: "text" },
  repartizare_profit: { displayName: "Repartizare profit", category: "financial", dataType: "text" },

  // ── Bilanț ANAF (static field) ──
  an_fiscal: { displayName: "An fiscal", category: "financial", dataType: "text" },
};

/**
 * Dynamic field patterns — for extracted keys that contain a year suffix (e.g. cifra_afaceri_2023)
 * or an index (e.g. articol_0_utilaj_denumire, echipament_2_putere_cp).
 *
 * Each pattern defines: regex to match, function to generate displayName, category, dataType.
 * Checked only when the static CLIENT_DOC_FIELD_DEFS lookup fails.
 */
const DYNAMIC_FIELD_PATTERNS: Array<{
  pattern: RegExp;
  displayName: (match: RegExpMatchArray) => string;
  category: FieldDefCategory;
  dataType: FieldDefDataType;
}> = [
  // ── Bilanț / Certificat constatator — year-suffixed financial fields ──
  { pattern: /^cifra_afaceri_(\d{4})$/, displayName: (m) => `Cifra de afaceri ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^profit_net_(\d{4})$/, displayName: (m) => `Profit net ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^profit_brut_(\d{4})$/, displayName: (m) => `Profit brut ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^profit_exploatare_(\d{4})$/, displayName: (m) => `Profit exploatare ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^venituri_exploatare_(\d{4})$/, displayName: (m) => `Venituri exploatare ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^cheltuieli_exploatare_(\d{4})$/, displayName: (m) => `Cheltuieli exploatare ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^venituri_totale_(\d{4})$/, displayName: (m) => `Venituri totale ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^cheltuieli_totale_(\d{4})$/, displayName: (m) => `Cheltuieli totale ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^impozit_profit_(\d{4})$/, displayName: (m) => `Impozit profit ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^active_totale_(\d{4})$/, displayName: (m) => `Active totale ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^active_imobilizate_(\d{4})$/, displayName: (m) => `Active imobilizate ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^active_circulante_(\d{4})$/, displayName: (m) => `Active circulante ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^stocuri_(\d{4})$/, displayName: (m) => `Stocuri ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^creante_(\d{4})$/, displayName: (m) => `Creanțe ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^casa_conturi_(\d{4})$/, displayName: (m) => `Casa și conturi ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^capitaluri_proprii_(\d{4})$/, displayName: (m) => `Capitaluri proprii ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^capital_subscris_varsat_(\d{4})$/, displayName: (m) => `Capital subscris vărsat ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^rezerve_(\d{4})$/, displayName: (m) => `Rezerve ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^datorii_sub_an_(\d{4})$/, displayName: (m) => `Datorii sub 1 an ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^datorii_peste_an_(\d{4})$/, displayName: (m) => `Datorii peste 1 an ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^datorii_totale_(\d{4})$/, displayName: (m) => `Datorii totale ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^numar_angajati_(\d{4})$/, displayName: (m) => `Număr angajați ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^numar_angajati_efectiv_(\d{4})$/, displayName: (m) => `Număr angajați efectiv ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^imobilizari_sold_initial_(\d{4})$/, displayName: (m) => `Imobilizări sold inițial ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^imobilizari_cresteri_(\d{4})$/, displayName: (m) => `Imobilizări creșteri ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^imobilizari_reduceri_(\d{4})$/, displayName: (m) => `Imobilizări reduceri ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^imobilizari_sold_final_(\d{4})$/, displayName: (m) => `Imobilizări sold final ${m[1]}`, category: "financial", dataType: "number" },
  { pattern: /^amortizare_totala_(\d{4})$/, displayName: (m) => `Amortizare totală ${m[1]}`, category: "financial", dataType: "number" },

  // ── Ofertă preț — indexed articol fields ──
  { pattern: /^articol_(\d+)_utilaj_denumire$/, displayName: (m) => `Articol ${+m[1] + 1} — denumire utilaj`, category: "investment", dataType: "text" },
  { pattern: /^articol_(\d+)_specificatii_tehnice$/, displayName: (m) => `Articol ${+m[1] + 1} — specificații tehnice`, category: "investment", dataType: "text" },
  { pattern: /^articol_(\d+)_pret_unitar_eur$/, displayName: (m) => `Articol ${+m[1] + 1} — preț unitar (EUR)`, category: "investment", dataType: "number" },
  { pattern: /^articol_(\d+)_pret_total_eur$/, displayName: (m) => `Articol ${+m[1] + 1} — preț total (EUR)`, category: "investment", dataType: "number" },
  { pattern: /^articol_(\d+)_este_no_till$/, displayName: (m) => `Articol ${+m[1] + 1} — este no-till`, category: "investment", dataType: "text" },

  // ── Contract — indexed parts, bunuri, parcele ──
  { pattern: /^parte_contract_(\d+)_nume$/, displayName: (m) => `Parte contract ${+m[1] + 1} — nume`, category: "legal", dataType: "text" },
  { pattern: /^parte_contract_(\d+)_rol$/, displayName: (m) => `Parte contract ${+m[1] + 1} — rol`, category: "legal", dataType: "text" },
  { pattern: /^parte_contract_(\d+)_tip$/, displayName: (m) => `Parte contract ${+m[1] + 1} — tip`, category: "legal", dataType: "text" },
  { pattern: /^parte_contract_(\d+)_cui_cnp$/, displayName: (m) => `Parte contract ${+m[1] + 1} — CUI/CNP`, category: "legal", dataType: "text" },
  { pattern: /^parte_contract_(\d+)_adresa$/, displayName: (m) => `Parte contract ${+m[1] + 1} — adresă`, category: "legal", dataType: "text" },
  { pattern: /^bun_contract_(\d+)_descriere$/, displayName: (m) => `Bun contract ${+m[1] + 1} — descriere`, category: "farm", dataType: "text" },
  { pattern: /^bun_contract_(\d+)_locatie$/, displayName: (m) => `Bun contract ${+m[1] + 1} — locație`, category: "farm", dataType: "text" },
  { pattern: /^bun_contract_(\d+)_suprafata_ha$/, displayName: (m) => `Bun contract ${+m[1] + 1} — suprafață (ha)`, category: "farm", dataType: "number" },
  { pattern: /^bun_contract_(\d+)_suprafata_mp$/, displayName: (m) => `Bun contract ${+m[1] + 1} — suprafață (mp)`, category: "farm", dataType: "number" },
  { pattern: /^bun_contract_(\d+)_nr_cadastral$/, displayName: (m) => `Bun contract ${+m[1] + 1} — nr. cadastral`, category: "farm", dataType: "text" },
  { pattern: /^bun_contract_(\d+)_nr_CF$/, displayName: (m) => `Bun contract ${+m[1] + 1} — nr. CF`, category: "farm", dataType: "text" },
  { pattern: /^bun_contract_(\d+)_categorie_folosinta$/, displayName: (m) => `Bun contract ${+m[1] + 1} — categorie folosință`, category: "farm", dataType: "text" },
  { pattern: /^parcela_(\d+)_UAT$/, displayName: (m) => `Parcelă ${+m[1] + 1} — UAT`, category: "farm", dataType: "text" },
  { pattern: /^parcela_(\d+)_suprafata_ha$/, displayName: (m) => `Parcelă ${+m[1] + 1} — suprafață (ha)`, category: "farm", dataType: "number" },

  // ── Registru imobilizări — indexed echipamente ──
  { pattern: /^echipament_(\d+)_denumire$/, displayName: (m) => `Echipament ${+m[1] + 1} — denumire`, category: "farm", dataType: "text" },
  { pattern: /^echipament_(\d+)_an_achizitie$/, displayName: (m) => `Echipament ${+m[1] + 1} — an achiziție`, category: "farm", dataType: "text" },
  { pattern: /^echipament_(\d+)_valoare_inventar$/, displayName: (m) => `Echipament ${+m[1] + 1} — valoare inventar`, category: "farm", dataType: "number" },
  { pattern: /^echipament_(\d+)_putere_cp$/, displayName: (m) => `Echipament ${+m[1] + 1} — putere (CP)`, category: "farm", dataType: "number" },
  { pattern: /^echipament_(\d+)_stare$/, displayName: (m) => `Echipament ${+m[1] + 1} — stare`, category: "farm", dataType: "text" },
  { pattern: /^echipament_(\d+)_categorie$/, displayName: (m) => `Echipament ${+m[1] + 1} — categorie`, category: "farm", dataType: "text" },
  { pattern: /^echipament_(\d+)_exclus_anexa3$/, displayName: (m) => `Echipament ${+m[1] + 1} — exclus Anexa 3`, category: "farm", dataType: "text" },
  { pattern: /^echipament_(\d+)_vechime_ani$/, displayName: (m) => `Echipament ${+m[1] + 1} — vechime (ani)`, category: "farm", dataType: "number" },

  // ── Factură — indexed articole ──
  { pattern: /^articol_factura_(\d+)_denumire$/, displayName: (m) => `Articol factură ${+m[1] + 1} — denumire`, category: "financial", dataType: "text" },
  { pattern: /^articol_factura_(\d+)_descriere$/, displayName: (m) => `Articol factură ${+m[1] + 1} — descriere`, category: "financial", dataType: "text" },
  { pattern: /^articol_factura_(\d+)_um$/, displayName: (m) => `Articol factură ${+m[1] + 1} — UM`, category: "financial", dataType: "text" },
  { pattern: /^articol_factura_(\d+)_cantitate$/, displayName: (m) => `Articol factură ${+m[1] + 1} — cantitate`, category: "financial", dataType: "number" },
  { pattern: /^articol_factura_(\d+)_pret_unitar$/, displayName: (m) => `Articol factură ${+m[1] + 1} — preț unitar`, category: "financial", dataType: "number" },
  { pattern: /^articol_factura_(\d+)_valoare_fara_tva$/, displayName: (m) => `Articol factură ${+m[1] + 1} — valoare fără TVA`, category: "financial", dataType: "number" },
  { pattern: /^articol_factura_(\d+)_cota_tva$/, displayName: (m) => `Articol factură ${+m[1] + 1} — cotă TVA`, category: "financial", dataType: "number" },
  { pattern: /^articol_factura_(\d+)_valoare_totala$/, displayName: (m) => `Articol factură ${+m[1] + 1} — valoare totală`, category: "financial", dataType: "number" },

  // ── Act constitutiv — indexed asociați ──
  { pattern: /^asociat_ac_(\d+)_nume$/, displayName: (m) => `Asociat ${+m[1] + 1} — nume`, category: "beneficiary", dataType: "text" },
  { pattern: /^asociat_ac_(\d+)_aport$/, displayName: (m) => `Asociat ${+m[1] + 1} — aport`, category: "financial", dataType: "number" },
  { pattern: /^asociat_ac_(\d+)_procent$/, displayName: (m) => `Asociat ${+m[1] + 1} — procent`, category: "financial", dataType: "number" },
];

/**
 * Try to match a field_key against dynamic patterns.
 * Returns a field definition if matched, null otherwise.
 */
function matchDynamicFieldDef(fieldKey: string): {
  displayName: string;
  category: FieldDefCategory;
  dataType: FieldDefDataType;
} | null {
  for (const dp of DYNAMIC_FIELD_PATTERNS) {
    const match = fieldKey.match(dp.pattern);
    if (match) {
      return {
        displayName: dp.displayName(match),
        category: dp.category,
        dataType: dp.dataType,
      };
    }
  }
  return null;
}

/**
 * Convert a snake_case field key into a human-readable display name.
 * "nr_certificat_fiscal" → "Nr. certificat fiscal"
 * "cifra_afaceri_2023"   → "Cifra afaceri 2023"
 */
function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/, (c) => c.toUpperCase())
    // Common abbreviations
    .replace(/\bnr\b/gi, "Nr.")
    .replace(/\bcui\b/gi, "CUI")
    .replace(/\bcnp\b/gi, "CNP")
    .replace(/\biban\b/gi, "IBAN")
    .replace(/\btva\b/gi, "TVA")
    .replace(/\beur\b/gi, "EUR");
}

/**
 * Infer the elementDefinition data type from a runtime value.
 */
function inferDataType(value: any): "text" | "number" | "date" {
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    // ISO date or DD.MM.YYYY
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{2}\.\d{2}\.\d{4}$/.test(value)) return "date";
    // Purely numeric string
    if (/^-?\d+([.,]\d+)?$/.test(value.replace(/\s/g, ""))) return "number";
  }
  return "text";
}

/**
 * Infer a broad category from the document type and field key.
 * Uses the document type to guide the default category, since we can't add
 * custom values to the DB enum (beneficiary|farm|investment|location|financial|legal|technical|other).
 */
function inferCategory(fieldKey: string, documentType: string): "beneficiary" | "farm" | "investment" | "location" | "financial" | "legal" | "technical" | "other" {
  // Field-key heuristics (most specific)
  if (/^(cui|denumire|nume|prenume|cnp|telefon|email|firma)/.test(fieldKey)) return "beneficiary";
  if (/^(adresa|localitate|judet|sediu|locatie|uat)/.test(fieldKey)) return "location";
  if (/^(cifra|profit|venit|cheltuiel|datori|activ|capital|sold|suma|amortiz|rezerv|impozit|stoc|creant)/.test(fieldKey)) return "financial";
  if (/^(suprafat|parcela|cultura|ferma|echipament|tractor|putere)/.test(fieldKey)) return "farm";
  if (/^(utilaj|investit|pret|articol|furnizor|oferta)/.test(fieldKey)) return "investment";
  if (/^(nr_|data_|certificat|contract|act_|aviz|autorizat|notar)/.test(fieldKey)) return "legal";

  // Document-type heuristics (broad fallback)
  const docCategoryMap: Record<string, "beneficiary" | "farm" | "investment" | "location" | "financial" | "legal" | "technical" | "other"> = {
    certificat_constatator: "beneficiary",
    bilant_anaf: "financial",
    certificat_fiscal: "financial",
    extras_cont: "financial",
    carte_identitate: "beneficiary",
    diploma_studii: "beneficiary",
    contract_arenda: "legal",
    oferta_pret: "investment",
    registru_imobilizari: "farm",
    declaratie_expert_contabil: "financial",
    factura: "financial",
    act_constitutiv: "legal",
    document_mediu: "legal",
  };

  return docCategoryMap[documentType] ?? "other";
}

/**
 * Find the guide document associated with a project's folder tree.
 * Navigates: project → folderId → children (type=ghiduri) → documents (processingType=ghid, status=processed)
 */
async function findGuideDocumentForProject(projectFolderId: string, organizationId: string): Promise<string | null> {
  // Find the ghiduri subfolder
  const ghiduriFolder = await db.query.documentFolders.findFirst({
    where: and(
      eq(documentFolders.parentId, projectFolderId),
      eq(documentFolders.type, "ghiduri"),
      eq(documentFolders.organizationId, organizationId),
    ),
  });

  if (!ghiduriFolder) {
    // Try one level up (project might be nested)
    const parentFolder = await db.query.documentFolders.findFirst({
      where: eq(documentFolders.id, projectFolderId),
    });
    if (parentFolder?.parentId) {
      const ghiduriUp = await db.query.documentFolders.findFirst({
        where: and(
          eq(documentFolders.parentId, parentFolder.parentId),
          eq(documentFolders.type, "ghiduri"),
          eq(documentFolders.organizationId, organizationId),
        ),
      });
      if (ghiduriUp) {
        const guideDoc = await db.query.documents.findFirst({
          where: and(
            eq(documents.folderId, ghiduriUp.id),
            eq(documents.processingType, "ghid"),
            eq(documents.status, "processed"),
          ),
        });
        return guideDoc?.id ?? null;
      }
    }
    return null;
  }

  const guideDoc = await db.query.documents.findFirst({
    where: and(
      eq(documents.folderId, ghiduriFolder.id),
      eq(documents.processingType, "ghid"),
      eq(documents.status, "processed"),
    ),
  });
  return guideDoc?.id ?? null;
}

// GDPR: PII fields that must be encrypted before storage
const SENSITIVE_ELEMENT_KEYS = new Set(["cnp", "cnp_titular_diploma"]);

async function saveExtractedFieldsToProjectElements(
  extractionResult: ExtractionResult,
  documentId: string,
  organizationId: string,
  doc: { folderId: string; organizationId: string },
): Promise<{ projectId: string; updatedCount: number } | null> {
  const project = await findProjectForDocument(doc);
  if (!project) {
    console.log(`[saveExtracted] No project found for document folder ${doc.folderId}`);
    return null;
  }

  // Batch-resolve field keys against element_definitions
  const validFieldKeys = extractionResult.extracted_fields
    .filter(f => !f.field_key.startsWith("_") && f.field_value != null)
    .map(f => f.field_key);
  const resolvedKeys = await resolveFieldKeys(validFieldKeys, organizationId);

  const modifiedElementIds: string[] = [];
  let updatedCount = 0;
  let unmatchedCount = 0;
  let autoCreatedCount = 0;

  for (const field of extractionResult.extracted_fields) {
    // Skip internal/raw fields (prefixed with _)
    if (field.field_key.startsWith("_")) continue;

    // Skip null/undefined values
    if (field.field_value == null) continue;

    // Resolve anchor: element_definition (primary) or template_element (fallback)
    const elemDefMatch = resolvedKeys.get(field.field_key);
    let elementDefId: string | null = elemDefMatch?.id ?? null;
    let templateElementId: string | null = null;

    // Also try to find matching template element (for backward compat)
    const tmplEl = await findTemplateElementByKey(
      elemDefMatch?.elementKey ?? field.field_key,
      organizationId,
      project.folderId,
    );
    if (tmplEl) {
      templateElementId = tmplEl.id;
    }

    // If no anchor at all, try to auto-create elementDefinition for known client doc fields
    if (!elementDefId && !templateElementId) {
      // Check static definitions first, then dynamic patterns
      const knownDef = CLIENT_DOC_FIELD_DEFS[field.field_key] ?? matchDynamicFieldDef(field.field_key);
      if (knownDef) {
        // Find guide document to anchor the element definition
        const guideDocId = await findGuideDocumentForProject(project.folderId, organizationId);
        if (guideDocId) {
          try {
            const created = await upsertElementDefinition({
              guideDocumentId: guideDocId,
              organizationId,
              elementKey: field.field_key,
              displayName: knownDef.displayName,
              category: knownDef.category,
              dataType: knownDef.dataType,
              required: ("required" in knownDef ? knownDef.required : false) ?? false,
              sourcePriority: ["document_extracted", "solomon_chat", "consultant_manual"],
            });
            elementDefId = created.id;
            console.log(
              `[saveExtracted] Auto-created elementDefinition for "${field.field_key}" → ${created.id}`,
            );
          } catch (err) {
            console.warn(`[saveExtracted] Failed to auto-create elementDef for "${field.field_key}":`, err);
          }
        } else {
          console.log(
            `[saveExtracted] No guide document for project ${project.id} — cannot auto-create elementDef for "${field.field_key}"`,
          );
        }
      }

      // Level 4: Auto-create elementDefinition for unknown fields (auto-learn).
      // Instead of dropping, create a new elementDefinition with helpText marker
      // so consultants can review it in UI. The field is saved with confirmed=false.
      if (!elementDefId && !templateElementId) {
        const guideDocId = await findGuideDocumentForProject(project.folderId, organizationId);
        if (guideDocId) {
          try {
            const autoDisplayName = humanizeKey(field.field_key);
            const autoDataType = inferDataType(field.field_value);
            const autoCategory = inferCategory(field.field_key, extractionResult.document_type);

            const created = await upsertElementDefinition({
              guideDocumentId: guideDocId,
              organizationId,
              elementKey: field.field_key,
              displayName: autoDisplayName,
              category: autoCategory,
              dataType: autoDataType,
              required: false,
              sourcePriority: ["document_extracted", "solomon_chat", "consultant_manual"],
              helpText: `[auto-extract] Câmp detectat automat din document tip "${extractionResult.document_type}". Necesită verificare consultant.`,
            });
            elementDefId = created.id;
            autoCreatedCount++;
            console.log(
              `[saveExtracted] AUTO-CREATE L4: "${field.field_key}" din "${extractionResult.document_type}" → ${created.id} (${autoDisplayName}, ${autoCategory}/${autoDataType})`,
            );
          } catch (err) {
            console.warn(`[saveExtracted] Failed to auto-create L4 elementDef for "${field.field_key}":`, err);
          }
        }

        // If still no anchor (no guide doc at all), drop as last resort
        if (!elementDefId && !templateElementId) {
          unmatchedCount++;
          console.log(
            `[saveExtracted] No guide document for project ${project.id} — field "${field.field_key}" dropped (no anchor possible). ` +
            `Value: "${String(field.field_value).slice(0, 100)}"`,
          );
          continue;
        }
      }
    }

    // Stringify value for storage (project_elements.value is TEXT)
    let stringValue = typeof field.field_value === "object"
      ? JSON.stringify(field.field_value)
      : String(field.field_value);

    // GDPR: Encrypt sensitive PII fields (CNP) before storage
    const resolvedKey = elemDefMatch?.elementKey ?? tmplEl?.key ?? field.field_key;
    if (SENSITIVE_ELEMENT_KEYS.has(resolvedKey) && stringValue) {
      try {
        stringValue = encrypt(stringValue);
      } catch (err) {
        console.error(`[saveExtracted] GDPR: Failed to encrypt ${resolvedKey}:`, err);
        // Do NOT store plaintext CNP — skip this field
        continue;
      }
    }

    // Check for existing project element (by elementDefId or templateElementId)
    let existing = null;
    if (elementDefId) {
      existing = await db.query.projectElements.findFirst({
        where: and(
          eq(projectElements.projectId, project.id),
          eq(projectElements.elementDefId, elementDefId),
        ),
      });
    }
    if (!existing && templateElementId) {
      existing = await db.query.projectElements.findFirst({
        where: and(
          eq(projectElements.projectId, project.id),
          eq(projectElements.templateElementId, templateElementId),
        ),
      });
    }

    if (!existing) {
      // CREATE new project element
      const [created] = await db.insert(projectElements).values({
        projectId: project.id,
        templateElementId,
        elementDefId,
        value: stringValue,
        source: "document_extracted",
        sourceDocumentId: documentId,
        validationStatus: "pending",
      }).returning();

      modifiedElementIds.push(created.id);
      updatedCount++;
    } else if (existing.source === "document_extracted" || existing.source === "calculated" || existing.source === "ghid") {
      // UPDATE — document_extracted/calculated/ghid can be overwritten by newer extraction
      // Audit the old value
      await logElementChange({
        projectElementId: existing.id,
        oldValue: existing.value,
        newValue: stringValue,
        oldValidationStatus: existing.validationStatus as any,
        newValidationStatus: "pending",
        changedBy: null, // system/automated
        changeSource: "document_extracted",
      });

      await db.update(projectElements).set({
        value: stringValue,
        source: "document_extracted",
        sourceDocumentId: documentId,
        validationStatus: "pending",
        confirmed: false,
        confirmedBy: null,
        // Backfill elementDefId if we now have it but didn't before
        ...(elementDefId && !existing.elementDefId ? { elementDefId } : {}),
      }).where(eq(projectElements.id, existing.id));

      modifiedElementIds.push(existing.id);
      updatedCount++;
    } else {
      // CONFLICT — existing value from solomon/manual/onrc — do NOT overwrite
      const keyLabel = elemDefMatch?.elementKey ?? tmplEl?.key ?? field.field_key;
      console.log(
        `[saveExtracted] Conflict: element ${keyLabel} (project ${project.id}) ` +
        `has source '${existing.source}', extracted value skipped. ` +
        `Existing: "${existing.value}", Extracted: "${stringValue}"`,
      );

      // Save conflict info in audit log so consultant can review
      await logElementChange({
        projectElementId: existing.id,
        oldValue: existing.value,
        newValue: `[CONFLICT] ${stringValue}`,
        oldValidationStatus: existing.validationStatus as any,
        newValidationStatus: existing.validationStatus as any,
        changedBy: null,
        changeSource: "document_extracted",
      });
    }
  }

  if (unmatchedCount > 0 || autoCreatedCount > 0) {
    console.log(
      `[saveExtracted] ${autoCreatedCount} fields auto-created (L4), ${unmatchedCount} fields dropped (no guide doc to anchor).`,
    );
  }

  // Validate modified elements
  for (const elementId of modifiedElementIds) {
    try {
      const validation = await validateElement(elementId, project.id);
      await db.update(projectElements).set({
        validationStatus: validation.status,
        validationDetails: validation.details,
      }).where(eq(projectElements.id, elementId));
    } catch (err) {
      console.error(`[saveExtracted] Validation failed for element ${elementId}:`, err);
    }
  }

  // SSE: notify frontend that elements were updated
  if (updatedCount > 0) {
    publishEvent(`project:${project.id}:updates`, "elements_updated", {
      projectId: project.id,
      documentId,
      updatedCount,
      autoCreatedCount,
      elementIds: modifiedElementIds,
      message: autoCreatedCount > 0
        ? `${updatedCount} elemente actualizate (${autoCreatedCount} câmpuri noi detectate — necesită verificare)`
        : `${updatedCount} elemente actualizate din document`,
    }).catch((e: any) => console.warn("[processClientDoc] sse elements updated:", e.message));
  }

  // === CASCADE: Eligibility → Scoring → SSE ===
  // Mirror the cascade from projects.ts PUT /:id/elements/:eid
  if (modifiedElementIds.length > 0) {
    // 1. Re-check eligibility
    try {
      await checkEligibility(project.id, organizationId);

      const eligibility = await db.query.projectEligibility.findMany({
        where: eq(projectEligibility.projectId, project.id),
      });

      publishEligibilityUpdated(project.id, {
        total: eligibility.length,
        passed: eligibility.filter(e => e.status === "passed").length,
        failed: eligibility.filter(e => e.status === "failed").length,
        pending: eligibility.filter(e => e.status === "pending").length,
        message: `Eligibilitate re-evaluată: ${eligibility.filter(e => e.status === "passed").length}/${eligibility.length} trecute`,
      }).catch((e: any) => console.warn("[processClientDoc] sse eligibility updated:", e.message));
    } catch (err) {
      console.error(`[saveExtracted] Eligibility check failed for project ${project.id}:`, err);
    }

    // 2. Recompute scoring
    try {
      const scoreResult = await computeProjectScores(project.id);
      if (scoreResult.scores.length > 0) {
        publishScoreUpdated(project.id, {
          totalPoints: scoreResult.totalPoints,
          maxTotalPoints: scoreResult.maxTotalPoints,
          percentage: scoreResult.percentage,
          message: `Punctaj actualizat: ${scoreResult.totalPoints}/${scoreResult.maxTotalPoints} (${scoreResult.percentage}%)`,
        }).catch((e: any) => console.warn("[processClientDoc] sse score updated:", e.message));
      }
    } catch (err) {
      console.error(`[saveExtracted] Score computation failed for project ${project.id}:`, err);
    }
  }

  return { projectId: project.id, updatedCount };
}

export const processClientDocWorker = new Worker<ProcessClientDocPayload>(
  "process-client-doc",
  async (job: Job<ProcessClientDocPayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // Step 1: Extract text
      let text = "";
      let pdfPageImages: Array<{ page: number; imageBase64: string }> = []; // For Vision-first extraction (CI, passport)
      if (doc.fileType === "pdf") {
        const pdfResult = await extractTextFromPDF(buffer);
        text = pdfResult.text;
        // Preserve page images for Vision-first document types (e.g. carte_identitate)
        pdfPageImages = pdfResult.pages
          .filter(p => p.imageBase64)
          .map(p => ({ page: p.page, imageBase64: p.imageBase64! }));
      } else if (doc.fileType === "docx") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "doc") {
        text = await extractTextFromDOC(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else if (doc.fileType === "png" || doc.fileType === "jpg" || doc.fileType === "jpeg") {
        text = await extractTextFromImage(buffer, fileName);
        // Preserve raw image for Vision-first extraction (CI, passport)
        const mediaType = doc.fileType === "png" ? "image/png" : "image/jpeg";
        pdfPageImages = [{ page: 1, imageBase64: buffer.toString("base64") }];
      } else {
        throw new Error(`Format nesuportat: ${doc.fileType}`);
      }

      await job.updateProgress(20);

      // Step 2: Classify document type using Haiku
      const classification = await classifyDocument(text);

      await job.updateProgress(40);

      await logAIUsage({
        organizationId,
        agent: "ocr",
        model: "claude-haiku-4-5-20251001",
        tokensInput: 500,
        tokensOutput: 100,
        action: "classify_client_document",
      });

      // Step 2.5: Optional Sonnet pre-structuring for large/messy documents
      const pageCount = (text.match(/--- Pagina|--- Sheet/g) || []).length || 1;
      let extractionText = text; // text used for extraction (may be pre-structured)
      let preStructured = false;

      if (shouldPreStructure(classification.documentType, pageCount, text.length)) {
        try {
          const preStructStart = Date.now();
          publishEvent(`org:${organizationId}:uploads`, "extraction_progress", {
            documentId,
            documentName: doc.name,
            progress: 45,
            message: `Pre-structurare text cu Sonnet (${pageCount} pagini, ${(text.length / 1000).toFixed(0)}K chars)...`,
          }).catch((e: any) => console.warn("[processClientDoc] sse pre-structure progress:", e.message));

          const preStructResult = await preStructureClientText(text);
          extractionText = preStructResult.cleanedText;
          preStructured = true;

          const preStructDuration = Date.now() - preStructStart;
          console.log(
            `[processClientDoc] Sonnet pre-structuring: ${preStructDuration}ms for "${doc.name}" ` +
            `(${preStructResult.pageCount} pages, ${preStructResult.tableCount} tables, ` +
            `quality=${preStructResult.qualityScore.toFixed(2)})`,
          );

          await logAIUsage({
            organizationId,
            agent: "ocr",
            model: "claude-sonnet-4-6-20250514",
            tokensInput: Math.min(Math.round(text.length / 4), 30000),
            tokensOutput: Math.min(Math.round(text.length / 4), 25000),
            action: "pre_structure_client_doc",
          });
        } catch (err) {
          // Pre-structuring failure is non-fatal — fall back to raw text
          console.warn(`[processClientDoc] Pre-structuring failed for "${doc.name}", using raw text:`, err);
          extractionText = text;
        }
      }

      await job.updateProgress(50);

      // Step 3: Extract structured data (with cache dedup)
      let extractionResult: ExtractionResult | null = null;
      let cacheHit = false;
      const contentHash = getContentHash(extractionText);

      // Load vocabulary from element_definitions for vocabulary-guided extraction
      let vocab: string[] | undefined;
      try {
        const vocabData = await getExtractorVocabulary(organizationId);
        if (vocabData.keys.length > 0) {
          vocab = vocabData.keys;
        }
      } catch {
        // No element_definitions yet — vocabulary will be undefined (no constraint)
      }

      // Notify frontend that extraction is starting
      publishExtractionStarted(organizationId, {
        documentId,
        documentName: doc.name,
        documentType: classification.documentType,
        message: `Extrag date din "${doc.name}" (${classification.documentType})...`,
      }).catch((e: any) => console.warn("[processClientDoc] sse extraction started:", e.message));

      try {
        // Check cache first
        extractionResult = await checkCachedExtraction(
          contentHash,
          classification.documentType,
          organizationId,
        );

        if (extractionResult) {
          cacheHit = true;
          await job.updateProgress(80);
          // No AI usage logged — cache hit saves cost
        } else {
          // P4 fix: Check for compound documents before extraction.
          // A compound doc (e.g. act constitutiv + certificat constatator in one PDF)
          // should be split into sub-documents, each processed by the appropriate extractor.
          const subDocs = detectCompoundDocument(extractionText);

          if (subDocs && subDocs.length > 1) {
            // Compound document: extract from each sub-document and merge results
            const allFields: ExtractionResult["extracted_fields"] = [];
            let totalTimeMs = 0;

            for (const sub of subDocs) {
              if (sub.suggestedType === "unknown_preamble" || sub.text.trim().length < 100) continue;

              // Classify each sub-document independently
              const subClassification = await classifyDocument(sub.text.slice(0, 3000));
              const subType = subClassification.documentType;

              console.log(
                `[compoundDoc] Sub-doc pp. ${sub.startPage}-${sub.endPage}: ` +
                `suggested="${sub.suggestedType}", classified="${subType}"`,
              );

              const subResult = await runExtractor(subType, sub.text, vocab, pdfPageImages);
              if (subResult) {
                // Prefix field keys with sub-doc type to avoid collisions
                for (const field of subResult.extracted_fields) {
                  field.source_page = field.source_page
                    ? field.source_page + sub.startPage - 1
                    : sub.startPage;
                  allFields.push(field);
                }
                totalTimeMs += subResult.processing_time_ms;
              }
            }

            if (allFields.length > 0) {
              extractionResult = {
                document_type: `compound_${classification.documentType}`,
                extracted_fields: allFields,
                raw_text: extractionText.slice(0, 5000),
                processing_time_ms: totalTimeMs,
              };
            }
          } else {
            // Single document — normal extraction (uses pre-structured text if available)
            extractionResult = await runExtractor(classification.documentType, extractionText, vocab, pdfPageImages);
          }

          await job.updateProgress(80);

          if (extractionResult) {
            const extractModel = getExtractorModel(classification.documentType);
            await logAIUsage({
              organizationId,
              agent: "ocr",
              model: extractModel,
              tokensInput: Math.min(Math.round(text.length / 4), 20000),
              tokensOutput: 2000,
              action: `extract_${classification.documentType}`,
            });

            // Save to cache for future dedup
            await saveToExtractionCache(
              contentHash,
              classification.documentType,
              organizationId,
              extractionResult,
              extractionText.length,
            );
          }
        }

        // Stream per-field SSE events so frontend shows fields appearing one by one
        if (extractionResult && extractionResult.extracted_fields.length > 0) {
          const visibleFields = extractionResult.extracted_fields.filter(f => !f.field_key.startsWith("_"));
          const totalVisible = visibleFields.length;

          for (let i = 0; i < visibleFields.length; i++) {
            const field = visibleFields[i];
            publishFieldExtracted(organizationId, {
              documentId,
              documentName: doc.name,
              fieldKey: field.field_key,
              fieldValue: field.field_value,
              confidence: field.confidence,
              fieldIndex: i + 1,
              totalFields: totalVisible,
              documentType: classification.documentType,
            }).catch((e: any) => console.warn("[processClientDoc] sse field extracted:", e.message));
          }
        }
      } catch (extractError) {
        // Extraction failure is non-fatal — document is still classified
        console.error(`Extraction failed for ${classification.documentType}:`, extractError);
      }

      // Step 4: Save classification + extraction results to DB
      await db.update(documents).set({
        status: "processed",
        pageCount,
        documentTypeClass: classification.documentType as any,
        classificationConfidence: classification.confidence.toFixed(2),
        processingResult: extractionResult ?? undefined,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      // Step 5: Save extracted fields into project_elements
      let elementsSaveResult: { projectId: string; updatedCount: number } | null = null;
      if (extractionResult && extractionResult.extracted_fields.length > 0) {
        try {
          elementsSaveResult = await saveExtractedFieldsToProjectElements(
            extractionResult,
            documentId,
            organizationId,
            { folderId: doc.folderId, organizationId },
          );
          if (elementsSaveResult) {
            console.log(
              `[processClientDoc] Saved ${elementsSaveResult.updatedCount} elements ` +
              `to project ${elementsSaveResult.projectId} from doc ${documentId}`,
            );
          }
        } catch (err) {
          // Non-fatal: extraction data is still saved in processingResult
          console.error(`[processClientDoc] Failed to save extracted fields to project_elements:`, err);
        }
      }

      await job.updateProgress(95);

      // Step 6: SSE notifications
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "client_doc",
        documentType: classification.documentType,
        confidence: classification.confidence,
        preStructured,
        message: preStructured
          ? `Document procesat "${doc.name}" — clasificat ca ${classification.documentType} (pre-structurat cu Sonnet)`
          : `Document procesat "${doc.name}" — clasificat ca ${classification.documentType}`,
      }).catch((e: any) => console.warn("[processClientDoc] sse document processed:", e.message));

      if (extractionResult && extractionResult.extracted_fields.length > 0) {
        publishEvent(`org:${organizationId}:uploads`, "extraction_complete", {
          documentId,
          documentName: doc.name,
          documentType: classification.documentType,
          fields_count: extractionResult.extracted_fields.length,
          processing_time_ms: extractionResult.processing_time_ms,
          cacheHit,
          message: cacheHit
            ? `Extrase ${extractionResult.extracted_fields.length} câmpuri din "${doc.name}" (din cache)`
            : `Extrase ${extractionResult.extracted_fields.length} câmpuri din "${doc.name}"`,
        }).catch((e: any) => console.warn("[processClientDoc] sse extraction complete:", e.message));
      }

      // Step 7: Auto-match checklist items based on document classification
      const resolvedProjectId = elementsSaveResult?.projectId;
      const checklistProjectId = resolvedProjectId
        || (await findProjectForDocument({ folderId: doc.folderId!, organizationId }))?.id;

      if (checklistProjectId) {
        try {
          const matchResult = await autoMatchChecklist(checklistProjectId, documentId, classification.documentType);
          if (matchResult.matched && matchResult.itemId && matchResult.itemName) {
            publishChecklistUpdated(checklistProjectId, {
              itemId: matchResult.itemId,
              itemName: matchResult.itemName,
              documentType: classification.documentType,
              documentId,
              message: `Checklist: "${matchResult.itemName}" bifat automat (${classification.documentType})`,
            }).catch((e: any) => console.warn("[processClientDoc] sse checklist_updated:", e.message));
          }
        } catch (err) {
          console.error(`[processClientDoc] autoMatchChecklist error:`, err);
        }
      }

      await job.updateProgress(100);

    } catch (error) {
      console.error(`Process client doc error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      const errorMsg = error instanceof Error ? error.message : "Eroare necunoscută";
      await db.update(documents).set({ status: docStatus as any, processingError: errorMsg }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        errorMessage: errorMsg,
        message: isLastAttempt
          ? `Eroare la procesarea documentului (toate ${job.opts.attempts || 3} încercări eșuate): ${errorMsg}`
          : `Eroare la procesarea documentului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă): ${errorMsg}`,
      }).catch((e: any) => console.warn("[processClientDoc] sse document failed:", e.message));
      throw error;
    }
  },
  { connection: redis as any }
);
