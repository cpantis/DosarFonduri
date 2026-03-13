import { Worker, Job } from "bullmq";
import { db } from "../db";
import {
  documents, projects, projectElements, templateElements,
  documentFolders, elementAuditLog, projectEligibility,
  extractionCache, elementDefinitions,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, extractTextFromImage, extractTextFromDOC, classifyDocument } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishEligibilityUpdated, publishScoreUpdated, publishFieldExtracted, publishExtractionStarted } from "../lib/sse";
import { validateElement, logElementChange } from "../services/elementValidation";
import { checkEligibility } from "../services/eligibility";
import { computeProjectScores } from "../services/scoring";
import type { ExtractionResult } from "../services/extractionTypes";
import { resolveFieldKeys, getExtractorVocabulary } from "../services/elementDefinitionService";

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
import { extractGeneric } from "../services/genericExtractor";

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

  if (data.asociati?.length) fields.push({ field_key: "_raw_asociati", field_value: data.asociati, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.administratori?.length) fields.push({ field_key: "_raw_administratori", field_value: data.administratori, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.financials?.length) fields.push({ field_key: "_raw_financials", field_value: data.financials, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  return { document_type: "certificat_constatator", extracted_fields: fields, raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
}

/**
 * Adapt bilantParser output to the standardized ExtractionResult format.
 */
function adaptBilantResult(data: Awaited<ReturnType<typeof parseBilantPDF>>, rawText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const year = data.year;

  if (data.f20?.cifraAfaceriNeta != null) fields.push({ field_key: `cifra_afaceri_${year}`, field_value: data.f20.cifraAfaceriNeta, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitNet != null) fields.push({ field_key: `profit_net_${year}`, field_value: data.f20.profitNet, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitExploatare != null) fields.push({ field_key: `profit_exploatare_${year}`, field_value: data.f20.profitExploatare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.activeImobilizate?.total != null) fields.push({ field_key: `active_totale_${year}`, field_value: (data.f10.activeImobilizate.total || 0) + (data.f10.activeCirculante?.total || 0), confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.capitaluriProprii != null) fields.push({ field_key: `capitaluri_proprii_${year}`, field_value: data.f10.capitaluriProprii, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f30?.numarMediuSalariati != null) fields.push({ field_key: `numar_angajati_${year}`, field_value: data.f30.numarMediuSalariati, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });

  // Compute datorii_totale if we have the data
  if (data.f10?.datoriiSubAnul != null || data.f10?.datoriiPesteAnul != null) {
    const datorii = (data.f10.datoriiSubAnul || 0) + (data.f10.datoriiPesteAnul || 0);
    fields.push({ field_key: `datorii_totale_${year}`, field_value: datorii, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  }

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
async function runExtractor(documentType: string, text: string, vocabulary?: string[]): Promise<ExtractionResult | null> {
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
      return "claude-sonnet-4-20250514";
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

    // If no anchor at all, log and skip
    if (!elementDefId && !templateElementId) {
      unmatchedCount++;
      console.log(
        `[saveExtracted] No element_definition or template_element for key "${field.field_key}" — field dropped. ` +
        `Value: "${String(field.field_value).slice(0, 100)}"`,
      );
      continue;
    }

    // Stringify value for storage (project_elements.value is TEXT)
    const stringValue = typeof field.field_value === "object"
      ? JSON.stringify(field.field_value)
      : String(field.field_value);

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

  if (unmatchedCount > 0) {
    console.log(`[saveExtracted] ${unmatchedCount} extracted fields had no matching element_definition or template_element`);
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
      elementIds: modifiedElementIds,
      message: `${updatedCount} elemente actualizate din document`,
    }).catch(() => {});
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
      }).catch(() => {});
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
        }).catch(() => {});
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
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // Step 1: Extract text
      let text = "";
      if (doc.fileType === "pdf") {
        text = await extractTextFromPDF(buffer);
      } else if (doc.fileType === "docx") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "doc") {
        text = await extractTextFromDOC(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else if (doc.fileType === "png" || doc.fileType === "jpg" || doc.fileType === "jpeg") {
        text = await extractTextFromImage(buffer, fileName);
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

      // Step 3: Extract structured data (with cache dedup)
      let extractionResult: ExtractionResult | null = null;
      let cacheHit = false;
      const contentHash = getContentHash(text);

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
      }).catch(() => {});

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
          const subDocs = detectCompoundDocument(text);

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

              const subResult = await runExtractor(subType, sub.text, vocab);
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
                raw_text: text.slice(0, 5000),
                processing_time_ms: totalTimeMs,
              };
            }
          } else {
            // Single document — normal extraction
            extractionResult = await runExtractor(classification.documentType, text, vocab);
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
              text.length,
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
            }).catch(() => {});
          }
        }
      } catch (extractError) {
        // Extraction failure is non-fatal — document is still classified
        console.error(`Extraction failed for ${classification.documentType}:`, extractError);
      }

      // Step 4: Save classification + extraction results to DB
      const pageCount = (text.match(/--- Pagina|--- Sheet/g) || []).length || 1;
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
        message: `Document procesat "${doc.name}" — clasificat ca ${classification.documentType}`,
      }).catch(() => {});

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
        }).catch(() => {});
      }

      await job.updateProgress(100);

    } catch (error) {
      console.error(`Process client doc error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      await db.update(documents).set({ status: docStatus as any }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        message: isLastAttempt
          ? `Eroare la procesarea documentului (toate ${job.opts.attempts || 3} încercări eșuate)`
          : `Eroare la procesarea documentului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă)`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
