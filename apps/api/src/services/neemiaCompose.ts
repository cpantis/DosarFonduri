/**
 * Neemia COMPOSE Mode — AI-powered document composition
 *
 * Unlike FILL mode (deterministic placeholder replacement), COMPOSE mode:
 * 1. Uses Claude AI to generate narrative text sections
 * 2. Builds dynamic, professionally formatted tables from project_elements + guide_reference_tables
 * 3. Inserts both narrative and tables into DOCX templates
 *
 * Template markers:
 *   {{COMPOSE:section_key}}  → AI generates narrative paragraph(s)
 *   {{TABLE:table_key}}      → AI builds a dynamic formatted table
 *   {{CALC:calc_key}}        → AI builds a calculation/demonstration table
 *   {{key}}                  → Simple value replacement (same as FILL mode)
 */

import { anthropic, withAILimit } from "../lib/anthropic";
import { db } from "../db";
import {
  projects, projectElements, projectDocuments,
  templateElements, documents, orgConfig, companies,
  guideReferenceTables, rules, ruleReferenceLinks, elementRuleLinks,
  organizations, solomonKnowledge, composeSectionVersions,
  projectChecklist, elementDefinitions,
} from "../db/schema";
import { eq, and, inArray, isNull, or, like, not } from "drizzle-orm";
import { getFileBuffer, uploadFile } from "./storage";
import { extractTextFromDOCX } from "./ocr";
import { logAIUsage } from "./aiUsage";
import { getCompanyDataFromElements } from "./companyElements";
import crypto from "crypto";


// ═══ CHECKLIST CRITICALITY MAP ═══
// Maps checklist item keywords to criticality levels for pre-generation warnings
const CHECKLIST_CRITICALITY = {
  critical: [
    'certificat constatator', 'bilant', 'situatii financiare',
    'oferta', 'oferte pret', 'memoriu', 'cerere finantare',
    'plan afaceri', 'deviz', 'buget'
  ],
  warning: [
    'diploma', 'certificat fiscal', 'extras cont',
    'declaratie', 'contract arenda', 'act constitutiv'
  ],
  // Everything else is 'info' level
} as const;


function safeTmpPath(prefix: string, ext: string): string {
  const os = require("os");
  const path = require("path");
  return path.join(os.tmpdir(), `${prefix}_${crypto.randomUUID()}.${ext}`);
}

// ═══ BLUEPRINT TYPES (Phase 1: Document Understanding) ═══

/** Generated once per template by AI — cached and reused across all projects */
export interface DocumentBlueprint {
  templateId: string;
  documentPurpose: string;          // "Memoriu Justificativ sM 4.1"
  evaluatorExpectations: string;    // Ce caută evaluatorul AFIR
  generatedAt: string;              // ISO timestamp
  generatedBy: string;              // AI model used
  sections: SectionBlueprint[];
}

export interface SectionBlueprint {
  sectionId: string;                 // matches compose marker
  title: string;                     // "Descrierea investiției"
  purpose: string;                   // "Demonstrează necesitatea investiției"
  requiredElementKeys: string[];     // Ce date TREBUIE să fie prezente
  optionalElementKeys: string[];     // Ce date îmbunătățesc secțiunea
  referenceTableIds: string[];       // Anexa 3, Anexa 4 dacă relevant
  tone: "formal" | "technical" | "narrative";
  targetLength: { min: number; max: number };  // cuvinte
  keywords: string[];                // "viabilitate", "modernizare" — ce caută evaluatorul
  evaluatorChecklist: string[];      // Ce bifează evaluatorul la această secțiune
  structureHint?: string;            // "CINE/CE → UNDE → DIMENSIUNE → URGENȚĂ"
  forbiddenPhrases?: string[];       // Expresii de evitat
}

// ═══ COMPOSE TYPES ═══

export interface ComposeSection {
  marker: string;
  type: "narrative" | "table" | "calculation";
  label: string;
  content?: string;
  tableData?: {
    headers: Array<{ key: string; label: string }>;
    rows: Array<Record<string, any>>;
    highlightRows?: number[];
    footerRow?: Record<string, any>;
    caption?: string;
    headerColor?: string;
  };
  approved: boolean;
}

export interface ComposeContext {
  projectName: string;
  companyName: string;
  companyCui: string;
  programFinantare: string;
  codMasura: string;
  companyAnalysis: Record<string, any>;
  numberFormat: "ro" | "en";
  templateText?: string;  // Extracted text from template DOCX for structural context
  elements: Record<string, { value: string; label: string; source: string }>;
  referenceTables: Array<{
    id: string;
    name: string;
    description: string | null;
    tableType: string;
    schema: Array<{ key: string; label: string; type: string }> | null;
    data: Array<Record<string, any>> | null;
  }>;
  relevantRules: Array<{
    description: string;
    category: string | null;
    type: string;
    sourceText: string | null;
  }>;
}

interface ComposeDocParams {
  projectId: string;
  templateDocumentId: string;
  organizationId: string;
  userId: string;
  previewOnly?: boolean;        // If true, return AI content without DOCX generation
  editedSections?: ComposeSection[];  // Consultant-edited sections to use instead of AI
  regenerateSectionMarker?: string;  // FIX 7: Regenerate only this section
}

// ═══ BUILD COMPOSE CONTEXT ═══
// Gathers all data needed for AI to generate content

export async function buildComposeContext(
  projectId: string,
  organizationId: string,
  templateDocumentId: string,
): Promise<ComposeContext> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new Error("Project not found");

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });

  // Load calculated company analysis (IMM, difficulty, trends, ratios)
  const companyAnalysis = company ? await getCompanyDataFromElements(company.id) : {};

  // Load all project elements with their template element metadata
  const projEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const tmplElIds = [...new Set(projEls.map(pe => pe.templateElementId).filter((id): id is string => id != null))];
  const allTmplEls = tmplElIds.length > 0
    ? await db.query.templateElements.findMany({
        where: inArray(templateElements.id, tmplElIds),
      })
    : [];
  const tmplElMap = new Map(allTmplEls.map(t => [t.id, t]));

  // Build elements map with metadata — resolve via templateElementId AND elementDefId
  const elements: ComposeContext["elements"] = {};

  // Load element definitions for elementDefId resolution
  const elemDefIds = [...new Set(projEls.map(pe => pe.elementDefId).filter((id): id is string => id != null))];
  const allElemDefs = elemDefIds.length > 0
    ? await db.query.elementDefinitions.findMany({
        where: inArray(elementDefinitions.id, elemDefIds),
      })
    : [];
  const elemDefMap = new Map(allElemDefs.map(ed => [ed.id, ed]));

  for (const pe of projEls) {
    if (!pe.value) continue;

    // Path 1: resolve via templateElementId (existing behavior)
    if (pe.templateElementId) {
      const te = tmplElMap.get(pe.templateElementId);
      if (te) {
        elements[te.key] = {
          value: pe.value,
          label: te.label,
          source: pe.source,
        };
        continue;
      }
    }

    // Path 2: resolve via elementDefId (new — handles guide-based elements)
    if (pe.elementDefId) {
      const ed = elemDefMap.get(pe.elementDefId);
      if (ed && !elements[ed.elementKey]) {
        elements[ed.elementKey] = {
          value: pe.value,
          label: ed.displayName || ed.elementKey,
          source: pe.source,
        };
      }
    }
  }

  // Inject project metadata
  if (project.programFinantare) elements["program_finantare"] = { value: project.programFinantare, label: "Program finanțare", source: "project" };
  if (project.codMasura) elements["cod_masura"] = { value: project.codMasura, label: "Cod măsură", source: "project" };
  if (project.codSesiune) elements["cod_sesiune"] = { value: project.codSesiune, label: "Cod sesiune", source: "project" };
  if (project.codNomenclator) elements["cod_nomenclator"] = { value: project.codNomenclator, label: "Cod nomenclator", source: "project" };
  if (project.codMysmis) elements["cod_mysmis"] = { value: project.codMysmis, label: "Cod MySMIS", source: "project" };
  if (company?.denumire) elements["denumire_firma"] = { value: company.denumire, label: "Denumire firmă", source: "company" };
  if (company?.cui) elements["cui_firma"] = { value: company.cui, label: "CUI", source: "company" };
  if (company?.caen) elements["caen_firma"] = { value: company.caen, label: "CAEN principal", source: "company" };
  if (company?.adresa) elements["adresa_firma"] = { value: company.adresa, label: "Adresă", source: "company" };
  if (company?.judet) elements["judet_firma"] = { value: company.judet, label: "Județ", source: "company" };
  if (company?.localitate) elements["localitate_firma"] = { value: company.localitate, label: "Localitate", source: "company" };

  // Load all reference tables for this organization's guide documents
  const refTables = await db.query.guideReferenceTables.findMany({
    where: eq(guideReferenceTables.organizationId, organizationId),
  });

  // Load rules — prioritize rules linked to this template's elements
  const orgRules = await db.query.rules.findMany({
    where: eq(rules.organizationId, organizationId),
  });

  // Find rules linked to elements in this template via elementRuleLinks
  const linkedRuleIds = new Set<string>();
  for (const te of allTmplEls) {
    const links = await db.query.elementRuleLinks.findMany({
      where: eq(elementRuleLinks.templateElementId, te.id),
    });
    for (const link of links) {
      linkedRuleIds.add(link.ruleId);
    }
  }

  // Sort rules: linked rules first, then unlinked (prioritized by type)
  const sortedRules = [
    ...orgRules.filter(r => linkedRuleIds.has(r.id)),
    ...orgRules.filter(r => !linkedRuleIds.has(r.id)),
  ];

  // Get template composeConfig to find specific reference tables
  const templateDoc = await db.query.documents.findFirst({
    where: eq(documents.id, templateDocumentId),
  });
  const composeConfig = (templateDoc as any)?.composeConfig as any;

  // Filter reference tables to those specified in composeConfig, or all if not specified
  let relevantRefTables = refTables;
  if (composeConfig?.sections) {
    const specifiedTableIds = new Set<string>();
    for (const section of composeConfig.sections) {
      if (section.referenceTableIds) {
        section.referenceTableIds.forEach((id: string) => specifiedTableIds.add(id));
      }
    }
    if (specifiedTableIds.size > 0) {
      relevantRefTables = refTables.filter(t => specifiedTableIds.has(t.id));
    }
  }

  // Load org branding for number format
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  const cabinetStyle = org?.cabinetDocumentStyle as Record<string, any> || {};

  // Extract template DOCX text for structural context
  let templateText: string | undefined;
  try {
    const templateDoc = await db.query.documents.findFirst({
      where: eq(documents.id, templateDocumentId),
    });
    if (templateDoc?.fileId) {
      const fileResult = await getFileBuffer(templateDoc.fileId);
      if (fileResult) {
        const rawText = await extractTextFromDOCX(fileResult.buffer, templateDoc.name || "template.docx");
        // Truncate to ~4000 chars to avoid overwhelming the prompt
        templateText = rawText.length > 4000 ? rawText.slice(0, 4000) + "\n[...truncat]" : rawText;
      }
    }
  } catch (err) {
    console.warn("[buildComposeContext] Could not extract template text:", err);
  }

  return {
    projectName: project.name,
    companyName: company?.denumire || "N/A",
    companyCui: company?.cui || "N/A",
    programFinantare: project.programFinantare || "N/A",
    codMasura: project.codMasura || "N/A",
    companyAnalysis,
    numberFormat: (cabinetStyle.numberFormat as "ro" | "en") || "ro",
    templateText,
    elements,
    referenceTables: relevantRefTables.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      tableType: t.tableType,
      schema: t.schema as any,
      data: t.data as any,
    })),
    relevantRules: sortedRules.slice(0, 50).map(r => ({
      description: r.description,
      category: r.category,
      type: r.type,
      sourceText: r.sourceText,
      linkedToTemplate: linkedRuleIds.has(r.id),
    })),
  };
}

// ═══ INTELLIGENT CHUNKING ═══
// Splits large documents into optimal chunks based on section complexity

type SectionSpec = {
  marker: string;
  type: "narrative" | "table" | "calculation";
  label: string;
  instructions?: string;
  elementKeys?: string[];
  referenceTableIds?: string[];
};

/** Estimate output complexity of a section in "weight units" (1 unit ≈ 800 output tokens) */
function estimateSectionWeight(section: SectionSpec, blueprint?: DocumentBlueprint | null): number {
  // Tables/calculations are cheaper — structured JSON output
  if (section.type === "table" || section.type === "calculation") {
    return 1;
  }
  // Narrative complexity depends on blueprint targetLength if available
  if (blueprint) {
    const bs = blueprint.sections?.find(
      s => s.sectionId === section.marker || s.sectionId === section.marker.replace("COMPOSE:", "")
    );
    if (bs?.targetLength) {
      // ~150 tokens per 100 words; add JSON overhead
      const estimatedTokens = (bs.targetLength.max / 100) * 150 + 200;
      return Math.max(1, Math.ceil(estimatedTokens / 800));
    }
  }
  // Default: narrative sections are ~2-3 weight units (1500-2400 tokens)
  return 2;
}

/** Split sections into chunks, respecting a max weight budget per chunk */
function buildChunks(
  sections: SectionSpec[],
  blueprint?: DocumentBlueprint | null,
  maxWeightPerChunk: number = 8,
): SectionSpec[][] {
  if (sections.length <= 3) return [sections]; // Small docs: single chunk

  const chunks: SectionSpec[][] = [];
  let currentChunk: SectionSpec[] = [];
  let currentWeight = 0;

  for (const section of sections) {
    const weight = estimateSectionWeight(section, blueprint);

    // If adding this section exceeds budget AND we have at least 1 section, start new chunk
    if (currentWeight + weight > maxWeightPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentWeight = 0;
    }

    currentChunk.push(section);
    currentWeight += weight;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/** Build a concise summary of already-generated sections for cross-chunk coherence */
function buildPreviousSectionsSummary(previousSections: ComposeSection[]): string {
  if (previousSections.length === 0) return "";

  const summaries = previousSections.map(s => {
    if (s.type === "narrative" && s.content) {
      // First 200 chars of narrative content
      const preview = s.content.slice(0, 200).replace(/\n/g, " ");
      return `- "${s.label}": ${preview}...`;
    }
    if (s.tableData) {
      return `- "${s.label}" (tabel): ${s.tableData.rows?.length || 0} rânduri, ${s.tableData.headers?.map(h => h.label).join(", ")}`;
    }
    return `- "${s.label}": generat`;
  }).join("\n");

  return `\nSECȚIUNI DEJA GENERATE (pentru coerență — NU le regenera, doar continuă stilul):
${summaries}\n`;
}

// ═══ AUTO-GENERATE PROGRAM-SPECIFIC WRITING KIT ═══
// Extracts terminology, keywords, and scoring criteria from guide rules

async function generateProgramWritingKit(
  programFinantare: string,
  codMasura: string | undefined,
  relevantRules: ComposeContext["relevantRules"],
  aiModel: string,
  organizationId: string,
  userId: string,
): Promise<Record<string, any>> {
  const rulesSummary = relevantRules.slice(0, 40)
    .map(r => `[${r.type}] ${r.category || "general"}: ${r.description}${r.sourceText ? ` (sursa: ${r.sourceText.slice(0, 100)})` : ""}`)
    .join("\n");

  const prompt = `Ești consultant senior în fonduri europene. Creezi un Writing Kit pentru programul "${programFinantare}" ${codMasura ? `(măsura ${codMasura})` : ""}.

DE CE CONTEAZĂ: Writing Kit-ul e "armamentul" consultantului. Conține exact cuvintele și frazele care câștigă puncte la evaluare. Un WK bun face diferența între un dosar de 70 puncte și unul de 90.

CUM GÂNDEȘTI:
- Fiecare evaluator are un VOCABULAR pe care îl caută — fraze care semnalează că autorul cunoaște programul
- Terminologia trebuie să fie specifică ACESTUI PROGRAM, nu generică fonduri europene
- "forbidden_phrases" = expresii care semnalează un dosar scris de cineva care nu cunoaște domeniul
- Scoring keywords trebuie mapate pe criteriile REALE din ghid (nu inventate)

REGULI DIN GHID:
${rulesSummary}

Generează un JSON cu:
1. "terminology" — array de {bad, good}: 8-12 perechi de expresii neprofesionale → formulări profesionale SPECIFICE acestui program (nu generice "implementare" vs "realizare" — ci specifice domeniului)
2. "evaluator_keywords" — obiect cu secțiuni:
   - "eligibility": 5-8 fraze cheie pe care evaluatorul le caută la eligibilitate (bazate pe regulile furnizate)
   - "necessity": 5-8 fraze pentru necesitate/oportunitate (legate de obiectivele programului)
   - "objectives": 5-8 fraze pentru contribuția la obiectivele programului (din regulile de scoring)
   - "impact": 5-8 fraze pentru impact și rezultate măsurabile (indicatori concreți din ghid)
   - "sustainability": 4-6 fraze pentru sustenabilitate (cerințe specifice perioadei de monitorizare)
   - "environment": 4-6 fraze pentru mediu/climă/social (dacă relevant pentru acest program)
3. "scoring_criteria" — obiect cu criteriile de selecție specifice: cheie = cod criteriu, valoare = array de keywords/fraze care CÂȘTIGĂ PUNCTE la acel criteriu
4. "forbidden_phrases" — array de expresii care semnalează un dosar slab (superlative goale, vag, lipsă cuantificare)
5. "program_specifics" — obiect cu:
   - "full_name": numele complet al programului (dedus din reguli)
   - "authority": autoritatea de management
   - "regulation_refs": referințe legislative relevante (din regulile furnizate)
   - "typical_beneficiaries": tipuri de beneficiari eligibili (din regulile de eligibilitate)
   - "intensity_ranges": intervale intensitate ajutor (din regulile de intensitate)

IMPORTANT: Totul în română. Totul SPECIFIC pentru "${programFinantare}". Bazează-te STRICT pe regulile furnizate — nu inventa criterii sau fraze generice.

Răspunde DOAR cu JSON valid.`;

  const response: any = await withAILimit(() => (anthropic.messages.create as any)({
    model: "claude-sonnet-4-6", // Use Sonnet for speed — WK gen is a one-time operation
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  }));

  await logAIUsage({
    organizationId,
    userId,
    agent: "neemia",
    model: "claude-sonnet-4-6",
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "writing_kit_generate",
  });

  const textContent = response.content.find((c: any) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("WK generation: empty response");

  let rawText = textContent.text.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  return JSON.parse(rawText);
}

// ═══ AI CONTENT GENERATION ═══
// Calls Claude to generate narrative sections and table structures (with chunking support)

async function generateComposeContent(
  context: ComposeContext,
  sections: SectionSpec[],
  aiModel: string,
  organizationId: string,
  userId: string,
  blueprint?: DocumentBlueprint | null,
  previousSections?: ComposeSection[],
): Promise<{ sections: ComposeSection[]; tokensInput: number; tokensOutput: number; placeholders: Array<{ section: string; placeholder: string }> }> {

  // Build element context string
  const elementsList = Object.entries(context.elements)
    .map(([key, { value, label }]) => `- ${label} (${key}): ${value}`)
    .join("\n");

  // Build reference tables context
  const tablesList = context.referenceTables.map(t => {
    const schemaStr = t.schema
      ? t.schema.map(s => `${s.label} (${s.key})`).join(", ")
      : "fără schemă definită";
    const dataPreview = t.data
      ? JSON.stringify(t.data.slice(0, 5), null, 2)
      : "[]";
    return `### ${t.name}\nTip: ${t.tableType}\nDescriere: ${t.description || "N/A"}\nColoane: ${schemaStr}\nDate (primele 5 rânduri):\n${dataPreview}`;
  }).join("\n\n");

  // Build rules context
  const rulesList = context.relevantRules
    .map(r => `- [${r.type}] ${r.category || "general"}: ${r.description}`)
    .join("\n");

  // Build sections request
  const sectionsRequest = sections.map(s => {
    const relevantElements = s.elementKeys
      ? Object.entries(context.elements)
          .filter(([key]) => s.elementKeys!.includes(key))
          .map(([key, { value, label }]) => `${label}: ${value}`)
          .join(", ")
      : "toate elementele proiectului";

    const relevantTables = s.referenceTableIds
      ? context.referenceTables
          .filter(t => s.referenceTableIds!.includes(t.id))
          .map(t => t.name)
          .join(", ")
      : "toate tabelele de referință";

    // If blueprint section has missing keys, instruct AI to mark placeholders
    let blueprintHint = "";
    const blueprintSection = blueprint?.sections?.find(
      (bs) => bs.sectionId === s.marker || bs.sectionId === s.marker.replace("COMPOSE:", "")
    );
    if (blueprintSection) {
      const missingRequired = (blueprintSection.requiredElementKeys || []).filter(
        (k: string) => !context.elements[k]?.value
      );
      if (missingRequired.length > 0) {
        blueprintHint = `\n- ATENȚIE: Lipsesc date obligatorii: ${missingRequired.join(", ")}. Pentru aceste câmpuri, inserează marcajul [DE COMPLETAT - descriere] cu explicație ce date sunt necesare.`;
      }
      if (blueprintSection.tone) {
        blueprintHint += `\n- Ton recomandat: ${blueprintSection.tone}`;
      }
      if (blueprintSection.targetLength) {
        blueprintHint += `\n- Lungime țintă: ${blueprintSection.targetLength.min}-${blueprintSection.targetLength.max} cuvinte`;
      }
      if (blueprintSection.keywords?.length) {
        blueprintHint += `\n- Cuvinte cheie evaluator: ${blueprintSection.keywords.join(", ")}`;
      }
      if (blueprintSection.evaluatorChecklist?.length) {
        blueprintHint += `\n- Evaluatorul verifică: ${blueprintSection.evaluatorChecklist.join("; ")}`;
      }
      if (blueprintSection.structureHint) {
        blueprintHint += `\n- Structura recomandată: ${blueprintSection.structureHint}`;
      }
      if (blueprintSection.forbiddenPhrases?.length) {
        blueprintHint += `\n- Expresii de evitat: ${blueprintSection.forbiddenPhrases.join(", ")}`;
      }
    }

    return `
## Secțiune: ${s.label}
- Marker: ${s.marker}
- Tip: ${s.type}
- Elemente relevante: ${relevantElements}
- Tabele referință: ${relevantTables}
${s.instructions ? `- Instrucțiuni specifice: ${s.instructions}` : ""}${blueprintHint}`;
  }).join("\n");

  // Load writing kit — prioritize program-specific, then org-specific, then global
  const programTag = context.programFinantare?.replace(/\s+/g, "_").toLowerCase() || "";
  const programWkCategory = programTag ? `wk_prog_${programTag}` : "";

  // Check if program-specific WK exists; if not, auto-generate from guide rules
  if (programWkCategory && context.relevantRules.length > 0) {
    const existingProgWk = await db.query.solomonKnowledge.findFirst({
      where: and(
        eq(solomonKnowledge.category, programWkCategory),
        eq(solomonKnowledge.enabled, true),
        or(
          isNull(solomonKnowledge.organizationId),
          eq(solomonKnowledge.organizationId, organizationId),
        ),
      ),
    });

    if (!existingProgWk) {
      try {
        const progWk = await generateProgramWritingKit(
          context.programFinantare,
          context.codMasura,
          context.relevantRules,
          aiModel,
          organizationId,
          userId,
        );
        // Save for future reuse (org-scoped so each cabinet can customize)
        await db.insert(solomonKnowledge).values({
          organizationId,
          category: programWkCategory,
          title: `Writing Kit — ${context.programFinantare} ${context.codMasura || ""}`.trim(),
          content: JSON.stringify(progWk),
          priority: 15, // Higher than generic WK (10)
          enabled: true,
        });
      } catch (err) {
        console.warn("[generateComposeContent] Program WK generation failed:", err);
      }
    }
  }

  // Load all applicable WK entries: program-specific + org-specific + global
  const writingKit = await db.select().from(solomonKnowledge)
    .where(and(
      like(solomonKnowledge.category, "wk_%"),
      eq(solomonKnowledge.enabled, true),
      or(
        isNull(solomonKnowledge.organizationId),
        eq(solomonKnowledge.organizationId, organizationId),
      ),
    ))
    .orderBy(solomonKnowledge.priority);

  // Load strategic references + manual knowledge for citation context
  const knowledgeBase = await db.select().from(solomonKnowledge)
    .where(and(
      eq(solomonKnowledge.organizationId, organizationId),
      eq(solomonKnowledge.enabled, true),
      not(like(solomonKnowledge.category, "wk_%")),
    ))
    .orderBy(solomonKnowledge.priority)
    .limit(50);

  // Deduplicate: if program-specific WK covers same topic as generic, prefer program-specific
  const writingKitFiltered = (() => {
    const programEntries = writingKit.filter(wk => wk.category.startsWith("wk_prog_"));
    const genericEntries = writingKit.filter(wk => !wk.category.startsWith("wk_prog_"));

    // If we have program-specific entries, skip generic scoring/keywords (they're for a different program)
    if (programEntries.length > 0) {
      const skipGeneric = new Set(["wk_scoring_keywords", "wk_keywords_eligibility",
        "wk_keywords_necessity", "wk_keywords_objectives", "wk_keywords_impact",
        "wk_keywords_sustainability", "wk_keywords_environment"]);
      return [
        ...programEntries,
        ...genericEntries.filter(wk => !skipGeneric.has(wk.category)),
      ];
    }
    return writingKit;
  })();

  // Load cabinet preferences from previous consultant edits (feedback loop)
  const cabinetEditHistory = await db.select({
    sectionMarker: composeSectionVersions.sectionMarker,
    source: composeSectionVersions.source,
  }).from(composeSectionVersions)
    .innerJoin(projectDocuments, eq(projectDocuments.id, composeSectionVersions.projectDocumentId))
    .innerJoin(projects, eq(projects.id, projectDocuments.projectId))
    .where(and(
      eq(projects.organizationId, organizationId),
      eq(composeSectionVersions.source, "consultant_edit"),
    ))
    .limit(50);

  const editedSectionCounts = new Map<string, number>();
  for (const edit of cabinetEditHistory) {
    editedSectionCounts.set(edit.sectionMarker, (editedSectionCounts.get(edit.sectionMarker) || 0) + 1);
  }

  const cabinetPreferences = editedSectionCounts.size > 0
    ? `\nPREFERINȚE CABINET (din editări anterioare):\n${
        [...editedSectionCounts.entries()]
          .filter(([, count]) => count >= 2)
          .map(([marker, count]) => `- Secțiunea "${marker}": consultantul a editat de ${count} ori — adaptează stilul`)
          .join("\n")
      }\n`
    : "";

  const writingKitContext = writingKitFiltered.length > 0
    ? writingKitFiltered.map(wk => {
        try {
          const parsed = JSON.parse(wk.content);
          return `## ${wk.title}\n${JSON.stringify(parsed, null, 2)}`;
        } catch {
          return `## ${wk.title}\n${wk.content}`;
        }
      }).join("\n\n")
    : "";

  // Build knowledge base context (references + manual entries)
  const knowledgeContext = knowledgeBase.length > 0
    ? `\n═══ BAZĂ DE CUNOȘTINȚE (${knowledgeBase.length} intrări) ═══
Folosește aceste referințe pentru a cita obiective strategice, date statistice, cadru legal:
${knowledgeBase.map(k => `[${k.category.toUpperCase()}] ${k.title}\n${k.content.slice(0, 500)}`).join("\n\n")}
`
    : "";

  // ── Template text context (structural awareness) ──
  const templateTextContext = context.templateText
    ? `\nSTRUCTURA DOCUMENTULUI TEMPLATE (text extras din DOCX):
${context.templateText}
`
    : "";

  const systemPrompt = `Ești Neemia — consultant senior cu 15+ ani experiență în redactarea documentelor pentru dosare de finanțare europeană.

═══ CINE EȘTI ═══
Scrii documente care câștigă finanțare. Nu ești un generator de text — ești expertul care știe că fiecare paragraf e citit de un evaluator care bifează un checklist strict. Documentele tale trebuie să fie indistinguibile de cele scrise de cei mai buni consultanți din piață.

CUM GÂNDEȘTI când scrii:
- Ca evaluatorul: "Ce criteriu bifez cu acest paragraf? Ce puncte câștig?"
- Ca auditorul: "Sunt cifrele consistente? Sursele citate? Calculele corecte?"
- Ca consultantul: "Am răspuns la TOATE cerințele din ghid pentru această secțiune?"
- Fiecare secțiune trebuie să DEMONSTREZE ceva evaluatorului, nu doar să DESCRIE

═══ CADRU LEGISLATIV ȘI FINANCIAR ═══
Cunoști legislația fondurilor europene (GBER, de minimis, OUG 66/2011, HG 399/2015, Legea 346/2004, regulamentele UE specifice per program). Folosește-ți cunoștințele ca FUNDAL, dar regulile SPECIFICE ale acestui proiect vin din REGULILE DIN GHID (listate mai jos). Când citezi un prag, o intensitate sau o condiție, bazează-te pe regulile extrase, nu pe valori generice.
- Formatul numerelor: ${context.numberFormat === "en" ? "EN: 1,234,567.89 RON (virgulă separare mii, punct zecimale)" : "RO: 1.234.567,89 RON (punct separare mii, virgulă zecimale)"}

═══ STIL DE SCRIERE — REGULI ABSOLUTE ═══
1. Scrie EXCLUSIV la persoana a III-a: "Solicitantul", "Societatea", "Beneficiarul" — NICIODATĂ "noi", "al nostru".
2. FIECARE afirmație de impact TREBUIE cuantificată: procent de creștere, valoare absolută, termen. "Productivitatea muncii va crește cu 35% față de anul 2024" — nu "se va îmbunătăți semnificativ".
3. Structura obligatorie per paragraf narativ: (a) Afirmație → (b) Date suport din proiect → (c) Legătura cu criteriul evaluatorului.
4. Terminologia profesională standard: "implementarea proiectului", "activități eligibile", "contribuție proprie", "ajutor financiar nerambursabil", "cofinanțare", "sustenabilitatea investiției".
5. Referință temporală: "față de anul [N]" sau "față de media ultimilor 3 ani fiscali".
6. Paragrafe de 3-5 propoziții — dense informativ, fără repetiții, fără superlative nejustificate ("enorm", "revoluționar", "fără precedent").
7. Fiecare tabel trebuie: caption explicativ, footer cu total/medie, evidențierea rândurilor relevante pentru proiect.

═══ REGULI STRICTE DE CONȚINUT ═══
1. Scrii EXCLUSIV în limba română, cu terminologie profesională de consultanță fonduri europene.
2. Conținutul trebuie să fie FACTUAL — bazat STRICT pe datele furnizate (elements, reference tables).
3. NU inventa date, cifre sau informații care nu sunt în context. Dacă o dată lipsește, marchează cu {{PLACEHOLDER_DESCRIERE}} — nu inventa.
4. Folosește formatul solicitat (narrative SAU table) exact cum e cerut.
5. Pentru tabele: returnează structura JSON exactă (headers + rows), nu text.
6. Argumentează legătura între datele proiectului și regulile din ghidul de finanțare.
7. Evidențiază (prin highlight) rândurile din tabele care sunt relevante pentru proiect.
8. Folosește cuvintele-cheie pe care le caută evaluatorul (din writing kit și blueprint keywords).

═══ STRUCTURI TIPICE PER SECȚIUNE ═══
- **Prezentare solicitant**: CINE (forma juridică, CUI, CAEN, nr. angajați) → CE face (obiect activitate) → UNDE (sediu, punct de lucru, zona) → DIMENSIUNE (CA, profit, active, classificare IMM)
- **Descriere investiție**: CE se achiziționează → CU CE SCOP → DIMENSIUNI tehnice → VALOARE totală → CONTRIBUȚIE proprie vs. ajutor nerambursabil
- **Necesitate/Oportunitate**: CONTEXT piață → PROBLEMĂ identificată → CONSECINȚE fără investiție → SOLUȚIE propusă → BENEFICII cuantificate
- **Obiective SMART**: Specific (ce exact) + Măsurabil (indicator + valoare) + Realizabil (resurse) + Relevant (pentru program) + Temporalizat (termen)
- **Impact economic**: Indicatori ÎNAINTE vs. DUPĂ (CA, profit, productivitate, nr. angajați) → % creștere → Perioada de referință
- **Sustenabilitate**: Viabilitate financiară (RIR, VAN, cash flow) → Capacitate managerială → Piață asigurată → Resurse umane → Mentenanță
- **Plan de investiții**: Categorie cheltuială → Denumire → Cantitate → Preț unitar → Valoare totală → Eligibil/Neeligibil
${writingKitContext ? `
═══ WRITING KIT — Terminologie și keywords profesionale ═══
${writingKitContext}
` : ""}${knowledgeContext}${cabinetPreferences}${templateTextContext}
═══ CONTEXT PROIECT ═══
- Nume proiect: ${context.projectName}
- Firmă: ${context.companyName} (CUI: ${context.companyCui})
- Program: ${context.programFinantare}
- Măsură: ${context.codMasura}
${context.companyAnalysis && Object.keys(context.companyAnalysis).length > 0 ? `
ANALIZĂ FINANCIARĂ FIRMĂ:
${context.companyAnalysis.clasificare_imm ? `- Clasificare IMM: ${context.companyAnalysis.clasificare_imm}` : ""}
${context.companyAnalysis.este_intreprindere_in_dificultate ? `- Întreprindere în dificultate: ${context.companyAnalysis.este_intreprindere_in_dificultate}` : ""}
${context.companyAnalysis.cifra_afaceri ? `- Cifra de afaceri: ${context.companyAnalysis.cifra_afaceri} RON` : ""}
${context.companyAnalysis.profit_net ? `- Profit net: ${context.companyAnalysis.profit_net} RON` : ""}
${context.companyAnalysis.angajati ? `- Angajați: ${context.companyAnalysis.angajati}` : ""}
${context.companyAnalysis.trend_cifra_afaceri_1an ? `- Trend CA: ${context.companyAnalysis.trend_cifra_afaceri_1an} (${context.companyAnalysis.trend_cifra_afaceri_1an_pct || 0}%)` : ""}
${context.companyAnalysis.grad_indatorare ? `- Grad îndatorare: ${context.companyAnalysis.grad_indatorare}` : ""}
${context.companyAnalysis.lichiditate_curenta ? `- Lichiditate: ${context.companyAnalysis.lichiditate_curenta}` : ""}
${context.companyAnalysis.solvabilitate ? `- Solvabilitate: ${context.companyAnalysis.solvabilitate}` : ""}
${context.companyAnalysis.capitaluri_proprii ? `- Capitaluri proprii: ${context.companyAnalysis.capitaluri_proprii} RON` : ""}
`.split("\n").filter((l: string) => l.trim()).join("\n") : ""}

ELEMENTE PROIECT (valori completate):
${elementsList}

TABELE DE REFERINȚĂ DIN GHID:
${tablesList}

REGULI RELEVANTE:
${rulesList}`;

  // Cross-chunk coherence context
  const coherenceContext = previousSections && previousSections.length > 0
    ? buildPreviousSectionsSummary(previousSections)
    : "";

  const userPrompt = `Generează conținutul pentru următoarele secțiuni ale documentului.
${coherenceContext}
IMPORTANT: Răspunde cu un JSON valid care conține un array "sections", unde fiecare secțiune are:
- "marker": string (marker-ul secțiunii)
- "type": "narrative" | "table" | "calculation"
- Pentru NARRATIVE: "content" (string cu text formatat minimal — paragrafe separate cu \\n\\n, **bold** pentru termeni cheie, - bullets pentru liste, ### pentru sub-titluri interne)
- Pentru TABLE/CALCULATION: "tableData" cu:
  - "headers": [{key, label}]
  - "rows": [{ key1: val1, key2: val2, ... }]
  - "highlightRows": [indexuri rânduri de evidențiat]  (opțional)
  - "footerRow": {key1: val1, ...}  (rând total/sumar, opțional)
  - "caption": string (titlu tabel, opțional)
  - "headerColor": string hex (culoare header, default "#1a3a5c")

SECȚIUNI DE GENERAT:
${sectionsRequest}

INSTRUCȚIUNI DETALIATE:
1. Scrie FIECARE secțiune narativă cu densitate maximă de informație — ca un consultant care știe că evaluatorul bifează un checklist strict. Fiecare paragraf trebuie să răspundă la un criteriu de evaluare concret.
2. Folosește keywords-urile din writing kit relevante pentru criteriile de selecție ale proiectului.
3. Pentru secțiunile narative: minim 3 paragrafe substanțiale (5+ rânduri fiecare), cu date concrete, procente, sume, indicatori. NU scrie răspunsuri de 2-3 rânduri.
4. Pentru tabele financiare: include TOATE categoriile de cheltuieli, calculează corect totalurile, folosește footer row obligatoriu.
5. Dacă datele sunt insuficiente pentru o secțiune, marchează lipsurile cu {{PLACEHOLDER_DESCRIERE}} dar scrie în jurul lor — nu lăsa secțiunea goală.
6. Scrie în română, cu date concrete din contextul de mai sus.
7. FORMATARE NARATIVĂ — folosește markdown minimal în "content":
   - **text bold** pentru termeni cheie, sume importante, concluzii (ex: **250.000 EUR**, **eligibil**)
   - ### Sub-titlu pentru secțiuni interne ale narativului (ex: ### Obiective specifice)
   - - bullet pentru enumerări (ex: - echipament 1\\n- echipament 2)
   - NU folosi alte formate markdown (italic, links, code blocks, etc.)

Răspunde DOAR cu JSON-ul, fără markdown code blocks, fără text suplimentar.`;

  // Use extended thinking for Opus models, higher max_tokens for all
  const useExtendedThinking = aiModel.includes("opus");
  const maxOutputTokens = useExtendedThinking ? 16000 : 12000;

  const apiParams: any = {
    model: aiModel,
    max_tokens: maxOutputTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  // Enable extended thinking for Opus models (deeper reasoning → better document quality)
  if (useExtendedThinking) {
    apiParams.thinking = { type: "enabled", budget_tokens: 8000 };
  }

  const response: any = await withAILimit(() => (anthropic.messages.create as any)(apiParams));

  const tokensInput = response.usage.input_tokens;
  const tokensOutput = response.usage.output_tokens;

  // Log AI usage
  await logAIUsage({
    organizationId,
    userId,
    agent: "neemia",
    model: aiModel,
    tokensInput,
    tokensOutput,
    action: "compose_generate",
  });

  // Parse AI response
  const textContent = response.content.find((c: any) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("AI response empty");
  }

  let rawText = textContent.text.trim();
  // Strip markdown code block if AI wrapped it
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed: { sections: any[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`AI returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  const composeSections: ComposeSection[] = parsed.sections.map((s: any) => ({
    marker: s.marker,
    type: s.type,
    label: sections.find(sec => sec.marker === s.marker)?.label || s.marker,
    content: s.content || undefined,
    tableData: s.tableData || undefined,
    approved: false,
  }));

  // Detect unresolved placeholders in narrative sections
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  const allPlaceholders: Array<{ section: string; placeholder: string }> = [];
  for (const section of composeSections) {
    if (section.content) {
      let match;
      while ((match = placeholderRegex.exec(section.content)) !== null) {
        allPlaceholders.push({ section: section.label, placeholder: match[1] });
      }
      placeholderRegex.lastIndex = 0;
    }
  }

  return { sections: composeSections, tokensInput, tokensOutput, placeholders: allPlaceholders };
}

// ═══ AUTO-GENERATE BLUEPRINT ═══
// Analyzes template structure + compose sections to create evaluation-aware blueprint

async function generateBlueprint(
  templateDoc: any,
  composeConfig: any,
  context: ComposeContext,
  aiModel: string,
  organizationId: string,
  userId: string,
): Promise<DocumentBlueprint> {
  const sectionsList = composeConfig.sections
    .map((s: any) => `- ${s.marker} (${s.type}): ${s.label}${s.instructions ? ` — ${s.instructions}` : ""}`)
    .join("\n");

  const elementsList = Object.entries(context.elements)
    .map(([key, { label }]) => `${key}: ${label}`)
    .join(", ");

  const rulesSummary = context.relevantRules.slice(0, 20)
    .map(r => `[${r.type}] ${r.description}`)
    .join("\n");

  const prompt = `Ești consultant senior în fonduri europene. Analizezi template-ul "${templateDoc.name}" pentru programul "${context.programFinantare}" (${context.codMasura}) și creezi un BLUEPRINT — planul strategic al documentului.

DE CE CONTEAZĂ: Blueprint-ul determină calitatea documentului generat. Un blueprint slab produce un document generic. Un blueprint bun produce un document care câștigă puncte la FIECARE criteriu de selecție.

CUM GÂNDEȘTI:
- Fiecare secțiune din document există cu un SCOP: să convingă evaluatorul de ceva specific
- evaluatorChecklist = ce bifează evaluatorul EFECTIV la această secțiune (nu generic, ci specific programului)
- keywords = cuvintele pe care evaluatorul le CAUTĂ în text (din grila de evaluare)
- structureHint = ordinea logică care face informația ușor de verificat pentru evaluator
- forbiddenPhrases = expresii care semnalează un dosar scris superficial

SECȚIUNI COMPOSE din template:
${sectionsList}

ELEMENTE DISPONIBILE: ${elementsList}

REGULI GHID (primele 20):
${rulesSummary}
${context.templateText ? `\nTEXT TEMPLATE:\n${context.templateText.slice(0, 2000)}` : ""}

Generează un DocumentBlueprint JSON cu:
- documentPurpose: scopul CONCRET al documentului (nu generic — specifică programul și măsura)
- evaluatorExpectations: ce caută evaluatorul la ACEST document specific (bazat pe regulile din ghid)
- sections: array cu câte o secțiune per marker, fiecare cu:
  - sectionId: marker-ul secțiunii
  - title: titlu complet
  - purpose: ce DEMONSTREAZĂ această secțiune evaluatorului (nu "descrie investiția" ci "demonstrează eligibilitatea investiției conform art. X din ghid")
  - requiredElementKeys: keys OBLIGATORII (fără ele secțiunea e incompletă)
  - optionalElementKeys: keys care CÂȘTIGĂ PUNCTE EXTRA la criteriile de selecție
  - referenceTableIds: [] (placeholder)
  - tone: "formal" | "technical" | "narrative"
  - targetLength: {min, max} în cuvinte (realist — o secțiune de obiective nu e 50 cuvinte)
  - keywords: 5-10 cuvinte-cheie din grila de evaluare/selecție (nu generice)
  - evaluatorChecklist: 3-5 puncte CONCRETE pe care le bifează evaluatorul (bazate pe regulile din ghid)
  - structureHint: structura recomandată (ex: "CINE→CE→UNDE→DIMENSIUNE")
  - forbiddenPhrases: expresii care semnalează un dosar slab

Răspunde DOAR cu JSON valid, fără markdown.`;

  const response: any = await withAILimit(() => (anthropic.messages.create as any)({
    model: aiModel.includes("opus") ? aiModel : "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  }));

  await logAIUsage({
    organizationId,
    userId,
    agent: "neemia",
    model: aiModel,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "blueprint_generate",
  });

  const textContent = response.content.find((c: any) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("Blueprint AI response empty");

  let rawText = textContent.text.trim();
  if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(rawText);
  return {
    templateId: templateDoc.id,
    documentPurpose: parsed.documentPurpose || templateDoc.name,
    evaluatorExpectations: parsed.evaluatorExpectations || "",
    generatedAt: new Date().toISOString(),
    generatedBy: aiModel,
    sections: (parsed.sections || []).map((s: any) => ({
      sectionId: s.sectionId,
      title: s.title || s.sectionId,
      purpose: s.purpose || "",
      requiredElementKeys: s.requiredElementKeys || [],
      optionalElementKeys: s.optionalElementKeys || [],
      referenceTableIds: s.referenceTableIds || [],
      tone: s.tone || "formal",
      targetLength: s.targetLength || { min: 100, max: 500 },
      keywords: s.keywords || [],
      evaluatorChecklist: s.evaluatorChecklist || [],
      structureHint: s.structureHint,
      forbiddenPhrases: s.forbiddenPhrases,
    })),
  };
}

// ═══ COMPOSE DOCUMENT (main flow, SSE streaming) ═══

export async function composeDocument(params: ComposeDocParams): Promise<ReadableStream> {
  const { projectId, templateDocumentId, organizationId, userId, previewOnly, editedSections, regenerateSectionMarker } = params;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        emit({ type: "status", message: "Se pregătește contextul COMPOSE..." });

        // Load template document
        const templateDoc = await db.query.documents.findFirst({
          where: eq(documents.id, templateDocumentId),
        });
        if (!templateDoc) throw new Error("Template not found");

        const composeConfig = (templateDoc as any)?.composeConfig as any;
        if (!composeConfig?.sections || composeConfig.sections.length === 0) {
          throw new Error("Template-ul nu are secțiuni COMPOSE configurate. Adăugați secțiuni în composeConfig.");
        }

        // Load AI model preference
        const config = await db.query.orgConfig.findFirst({
          where: eq(orgConfig.organizationId, organizationId),
        });
        const aiModel = composeConfig.aiModel || config?.neemiaModel || "claude-sonnet-4-6";

        emit({ type: "status", message: "Se colectează datele proiectului..." });

        // Build full context
        const context = await buildComposeContext(projectId, organizationId, templateDocumentId);

        emit({
          type: "context_ready",
          elements: Object.keys(context.elements).length,
          referenceTables: context.referenceTables.length,
          rules: context.relevantRules.length,
          sections: composeConfig.sections.length,
        });

        // Step 0: Auto-generate blueprint if missing (cached on template)
        let templateBlueprint = (templateDoc as any)?.blueprint as DocumentBlueprint | null;
        if (!templateBlueprint && !editedSections) {
          try {
            emit({ type: "status", message: "Se analizează structura template-ului (blueprint)..." });
            templateBlueprint = await generateBlueprint(templateDoc, composeConfig, context, aiModel, organizationId, userId);
            // Cache blueprint on template document for future reuse
            await db.update(documents)
              .set({ blueprint: templateBlueprint as any })
              .where(eq(documents.id, templateDocumentId));
            emit({ type: "blueprint_ready", sections: templateBlueprint.sections.length });
          } catch (err) {
            console.warn("[composeDocument] Blueprint generation failed, continuing without:", err);
          }
        }

        // Step 1: Generate AI content (or use edited sections)
        let composeSections: ComposeSection[];
        let tokensUsed = 0;

        // FIX 7: Filter sections to regenerate only the requested one
        const sectionsToGenerate: SectionSpec[] = regenerateSectionMarker
          ? composeConfig.sections.filter((s: any) => s.marker === regenerateSectionMarker)
          : composeConfig.sections;

        if (editedSections && editedSections.length > 0 && !regenerateSectionMarker) {
          emit({ type: "status", message: "Se folosesc secțiunile editate de consultant..." });
          composeSections = editedSections;
        } else {
          // ── Intelligent Chunking ──
          // Split sections into optimal chunks based on complexity
          const chunks = buildChunks(sectionsToGenerate, templateBlueprint);
          const totalChunks = chunks.length;
          const allPlaceholders: Array<{ section: string; placeholder: string }> = [];
          composeSections = [];

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkLabel = totalChunks > 1
              ? ` (parte ${i + 1}/${totalChunks}: ${chunk.map(s => s.label).join(", ")})`
              : "";

            emit({ type: "status", message: regenerateSectionMarker
              ? `Se regenerează secțiunea "${regenerateSectionMarker}" cu ${aiModel}...`
              : `Se generează conținutul cu ${aiModel}${chunkLabel}...`
            });

            if (totalChunks > 1) {
              emit({
                type: "chunk_progress",
                current: i + 1,
                total: totalChunks,
                sections: chunk.map(s => s.label),
              });
            }

            const aiResult = await generateComposeContent(
              context,
              chunk,
              aiModel,
              organizationId,
              userId,
              templateBlueprint,
              // Pass previously generated sections for cross-chunk coherence
              i > 0 ? composeSections : undefined,
            );

            composeSections.push(...aiResult.sections);
            tokensUsed += aiResult.tokensInput + aiResult.tokensOutput;

            if (aiResult.placeholders?.length) {
              allPlaceholders.push(...aiResult.placeholders);
            }
          }

          emit({
            type: "ai_complete",
            sections: composeSections,
            tokensUsed,
            model: aiModel,
            chunks: totalChunks,
          });

          // Warn about unresolved placeholders
          if (allPlaceholders.length > 0) {
            emit({
              type: "compose_warning",
              message: `${allPlaceholders.length} câmpuri necompletate detectate — marchează date lipsă`,
              missing: allPlaceholders,
            });
          }
        }

        // If preview only, stop here — frontend will show sections for review
        if (previewOnly) {
          emit({
            type: "preview_ready",
            sections: composeSections,
            tokensUsed,
            model: aiModel,
          });
          controller.close();
          return;
        }

        // Step 2: Build DOCX with narrative + tables
        emit({ type: "status", message: "Se descarcă template-ul DOCX..." });

        const { buffer: templateBuffer, name: templateName } = await getFileBuffer(templateDoc.fileId);

        // Load cabinet document style from organization
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, organizationId),
        });
        const cabinetStyle = org?.cabinetDocumentStyle || {};

        // Apply cabinet primary color to table headers if not already set
        if (cabinetStyle.primaryColor) {
          const headerColorHex = cabinetStyle.primaryColor.replace("#", "");
          for (const section of composeSections) {
            if (section.tableData && !section.tableData.headerColor) {
              section.tableData.headerColor = headerColorHex;
            }
          }
        }

        emit({ type: "status", message: "Se construiește documentul cu tabele și conținut narativ..." });

        // Re-read elements fresh before DOCX fill to capture any changes made during AI generation
        const freshContext = await buildComposeContext(projectId, organizationId, templateDocumentId);
        const simpleElements: Record<string, string> = {};
        for (const [key, { value }] of Object.entries(freshContext.elements)) {
          simpleElements[key] = value;
        }
        if (cabinetStyle.footerText) simpleElements["footer_cabinet"] = cabinetStyle.footerText;

        // Pass work/submission context for watermark decision
        const styleWithContext = {
          ...cabinetStyle,
          _isWorkDocument: true, // compose generates work documents by default
        };

        const filledBuffer = await composeDocxTemplate(
          templateBuffer,
          templateName,
          simpleElements,
          composeSections,
          styleWithContext,
        );

        // Step 3: Upload and save
        emit({ type: "status", message: "Se salvează documentul..." });

        const project = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        const prefix = project?.prefixDocumente ? `${project.prefixDocumente}` : "";
        const generatedFileName = `${prefix}${templateDoc.name}_compus_${new Date().toISOString().slice(0, 10)}.docx`;

        const fileId = await uploadFile(
          filledBuffer,
          generatedFileName,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          organizationId,
          userId,
        );

        // Version tracking
        const existingDocs = await db.query.projectDocuments.findMany({
          where: and(
            eq(projectDocuments.projectId, projectId),
            eq(projectDocuments.templateDocumentId, templateDocumentId),
          ),
          orderBy: (d, { desc }) => [desc(d.version)],
          limit: 1,
        });
        const nextVersion = existingDocs.length > 0 ? (existingDocs[0].version + 1) : 1;

        // Count filled sections
        const filledCount = Object.keys(simpleElements).length + composeSections.length;

        const [projectDoc] = await db.insert(projectDocuments).values({
          projectId,
          templateDocumentId,
          generatedFileId: fileId,
          status: "generated",
          version: nextVersion,
          pagesCompleted: templateDoc.pageCount || 0,
          totalPages: templateDoc.pageCount || 0,
          filledCount,
          missingCount: 0,
          missingKeys: [],
          generationMode: "compose",
          composeContent: {
            sections: composeSections,
            tokensUsed,
            aiModel,
            generatedAt: new Date().toISOString(),
          },
          generatedBy: userId,
        }).returning();

        // Feedback loop: save AI-generated text as version 1 per section
        const narrativeSections = composeSections.filter(s => s.content);
        if (narrativeSections.length > 0) {
          await db.insert(composeSectionVersions).values(
            narrativeSections.map(s => ({
              projectDocumentId: projectDoc.id,
              sectionMarker: s.marker,
              version: 1,
              content: s.content!,
              source: "neemia_ai" as const,
            })),
          );
        }

        // FIX 2: Auto-update checklist items matching this template
        await autoUpdateChecklistCompose(projectId, templateDoc.name);

        emit({
          type: "complete",
          documentId: projectDoc.id,
          fileId,
          fileName: generatedFileName,
          filledCount,
          missingCount: 0,
          generationMode: "compose",
          sections: composeSections.map(s => ({ marker: s.marker, type: s.type, label: s.label })),
        });

        controller.close();
      } catch (error) {
        emit({ type: "error", message: (error as Error).message });
        controller.close();
      }
    },
  });
}

// ═══ AUTO-UPDATE CHECKLIST POST-COMPOSE ═══
async function autoUpdateChecklistCompose(projectId: string, templateName: string): Promise<void> {
  const items = await db.select().from(projectChecklist)
    .where(and(
      eq(projectChecklist.projectId, projectId),
      eq(projectChecklist.done, false),
    ));

  const nameLower = templateName.toLowerCase();
  const matchKeywords = [
    { templateFragment: "memoriu", checklistKeywords: ["memoriu justificativ", "memoriu"] },
    { templateFragment: "plan_afaceri", checklistKeywords: ["plan afaceri", "plan de afaceri"] },
    { templateFragment: "cerere", checklistKeywords: ["cerere finantare", "cerere de finantare"] },
    { templateFragment: "studiu", checklistKeywords: ["studiu fezabilitate", "studiu"] },
  ];

  const itemsToUpdate: string[] = [];
  for (const item of items) {
    const itemNameLower = item.name.toLowerCase();
    for (const mapping of matchKeywords) {
      if (nameLower.includes(mapping.templateFragment) &&
          mapping.checklistKeywords.some(kw => itemNameLower.includes(kw))) {
        itemsToUpdate.push(item.id);
        break;
      }
    }
  }

  if (itemsToUpdate.length > 0) {
    await db.update(projectChecklist)
      .set({ done: true, notes: `Auto-marcat la generarea COMPOSE "${templateName}"` })
      .where(inArray(projectChecklist.id, itemsToUpdate));
  }
}

// ═══ COMPOSE DOCX TEMPLATE ═══
// Replaces {{key}} placeholders AND inserts AI-generated narrative/tables

async function composeDocxTemplate(
  templateBuffer: Buffer,
  _templateFileName: string,
  elements: Record<string, string>,
  sections: ComposeSection[],
  cabinetStyle?: Record<string, any>,
): Promise<Buffer> {
  const { execFileSync } = await import("child_process");
  const fs = await import("fs");

  const inputPath = safeTmpPath("compose_tmpl", "docx");
  const outputPath = safeTmpPath("compose_filled", "docx");
  const dataPath = safeTmpPath("compose_data", "json");

  fs.writeFileSync(inputPath, templateBuffer);
  fs.writeFileSync(dataPath, JSON.stringify({ elements, sections, cabinetStyle: cabinetStyle || {} }));

  const scriptPath = safeTmpPath("compose", "py");
  fs.writeFileSync(scriptPath, COMPOSE_PYTHON_SCRIPT);

  try {
    execFileSync("python3", [scriptPath, inputPath, outputPath, dataPath], {
      encoding: "utf-8",
      timeout: 120000,
    });
    return fs.readFileSync(outputPath);
  } finally {
    [inputPath, outputPath, dataPath, scriptPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });
  }
}

// ═══ PYTHON SCRIPT: COMPOSE DOCX BUILDER ═══
const COMPOSE_PYTHON_SCRIPT = `
import sys, json, re
from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
from copy import deepcopy

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    payload = json.load(f)

elements = payload.get('elements', {})
sections = payload.get('sections', [])
cabinet_style = payload.get('cabinetStyle', {})

doc = Document(template_path)

# ═══ FONT CASCADE: template → cabinet → fallback ═══
# Detect the dominant font in the template
def detect_template_font(doc):
    """Scan template paragraphs to find the most-used font."""
    font_counts = {}
    for para in doc.paragraphs:
        for run in para.runs:
            if run.font and run.font.name and run.text.strip():
                fn = run.font.name
                font_counts[fn] = font_counts.get(fn, 0) + len(run.text)
    if not font_counts:
        return None
    return max(font_counts, key=font_counts.get)

TEMPLATE_FONT = detect_template_font(doc)
CABINET_FONT = cabinet_style.get('fontFamily')
# Cascade: cabinet override > template detection > safe fallback
BASE_FONT = CABINET_FONT or TEMPLATE_FONT or 'Times New Roman'
# Table font can be slightly different (same family but smaller)
TABLE_FONT = BASE_FONT

# ═══ HELPER: Extract style from a marker paragraph ═══
def extract_paragraph_style(para):
    """Extract formatting properties from a paragraph to inherit them."""
    style = {
        'font_name': BASE_FONT,
        'font_size': 22,       # half-points (22 = 11pt)
        'font_color': '1A1E28',
        'space_after': 120,    # twips
        'space_before': 0,
        'line_spacing': 300,   # twips (300 = ~15pt)
        'alignment': None,
        'first_line_indent': None,
    }
    # Try to get from runs
    for run in para.runs:
        if run.font:
            if run.font.name:
                style['font_name'] = run.font.name
            if run.font.size:
                style['font_size'] = int(run.font.size.pt * 2)  # convert to half-points
            if run.font.color and run.font.color.rgb:
                style['font_color'] = str(run.font.color.rgb)
        break  # first run is enough

    # Paragraph format
    pf = para.paragraph_format
    if pf:
        if pf.space_after is not None:
            try: style['space_after'] = int(pf.space_after / Emu(12700))  # EMU to twips approx
            except: pass
        if pf.space_before is not None:
            try: style['space_before'] = int(pf.space_before / Emu(12700))
            except: pass
        if pf.alignment is not None:
            style['alignment'] = pf.alignment

    # Also check XML directly for more reliable spacing
    pPr = para._element.find(qn('w:pPr'))
    if pPr is not None:
        spacing = pPr.find(qn('w:spacing'))
        if spacing is not None:
            sa = spacing.get(qn('w:after'))
            if sa: style['space_after'] = int(sa)
            sb = spacing.get(qn('w:before'))
            if sb: style['space_before'] = int(sb)
            ln = spacing.get(qn('w:line'))
            if ln: style['line_spacing'] = int(ln)
        ind = pPr.find(qn('w:ind'))
        if ind is not None:
            fl = ind.get(qn('w:firstLine'))
            if fl: style['first_line_indent'] = int(fl)

    return style

# ═══ HELPER: Escape XML ═══
def esc(text):
    """Escape XML special characters."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

# ═══ HELPER: Replace {{key}} in paragraph preserving formatting ═══
def replace_in_paragraph(paragraph, data):
    full_text = paragraph.text
    replacements = []
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        if placeholder in full_text:
            replacements.append(key)
    if not replacements:
        return replacements
    runs_text = [run.text for run in paragraph.runs]
    combined = ''.join(runs_text)
    for key, value in data.items():
        placeholder = '{{' + key + '}}'
        combined = combined.replace(placeholder, str(value) if value else '')
    if paragraph.runs:
        paragraph.runs[0].text = combined
        for run in paragraph.runs[1:]:
            run.text = ''
    return replacements

# ═══ HELPER: Parse markdown-minimal content into rich runs ═══
def parse_rich_text(text, style):
    """Parse minimal markdown into OOXML runs.
    Supports: **bold**, ### Heading, - bullet items
    Returns a list of paragraph dicts: [{type, runs, indent}]
    """
    font = esc(style['font_name'])
    sz = style['font_size']
    color = style['font_color']
    paragraphs = []

    lines = text.split('\\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Sub-heading: ### Title
        if line.startswith('### '):
            heading_text = line[4:].strip()
            paragraphs.append({
                'type': 'heading',
                'runs': [{'text': esc(heading_text), 'bold': True, 'sz': sz + 2}],
            })
            i += 1
            continue

        # Bullet: - item
        if line.startswith('- '):
            bullet_text = line[2:].strip()
            runs = parse_inline_bold(bullet_text, font, sz, color)
            paragraphs.append({
                'type': 'bullet',
                'runs': runs,
            })
            i += 1
            continue

        # Regular paragraph — accumulate consecutive non-special lines
        para_lines = [line]
        i += 1
        while i < len(lines):
            next_line = lines[i].strip()
            if not next_line or next_line.startswith('### ') or next_line.startswith('- '):
                break
            para_lines.append(next_line)
            i += 1

        full_para = ' '.join(para_lines)
        runs = parse_inline_bold(full_para, font, sz, color)
        paragraphs.append({
            'type': 'paragraph',
            'runs': runs,
        })

    return paragraphs


def parse_inline_bold(text, font, sz, color):
    """Parse **bold** markers within text into runs."""
    runs = []
    parts = re.split(r'(\\*\\*[^*]+\\*\\*)', text)
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            inner = part[2:-2]
            runs.append({'text': esc(inner), 'bold': True, 'sz': sz})
        elif part:
            runs.append({'text': esc(part), 'bold': False, 'sz': sz})
    return runs


def build_rich_paragraph_xml(para_dict, style):
    """Build OOXML paragraph from parsed rich text dict."""
    font = esc(style['font_name'])
    color = style['font_color']
    sa = style['space_after']
    ls = style['line_spacing']
    first_indent = style.get('first_line_indent')

    ptype = para_dict['type']

    # Spacing and indentation
    spacing = f'<w:spacing w:after="{sa}" w:line="{ls}" w:lineRule="auto"/>'
    indent = ''

    if ptype == 'heading':
        # Sub-heading: slightly more space before, bold
        spacing = f'<w:spacing w:before="160" w:after="80" w:line="{ls}" w:lineRule="auto"/>'
    elif ptype == 'bullet':
        # Bullet: left indent + hanging indent for bullet char
        indent = '<w:ind w:left="720" w:hanging="360"/>'
    elif first_indent:
        indent = f'<w:ind w:firstLine="{first_indent}"/>'

    xml = f'<w:p {nsdecls("w")}><w:pPr>{spacing}{indent}</w:pPr>'

    # Add bullet character for bullet type
    if ptype == 'bullet':
        xml += f'<w:r><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/>'
        xml += f'<w:sz w:val="{style["font_size"]}"/><w:color w:val="{color}"/></w:rPr>'
        xml += '<w:t>&#x2022;</w:t></w:r>'
        xml += f'<w:r><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>'
        xml += f'<w:sz w:val="{style["font_size"]}"/></w:rPr>'
        xml += '<w:t xml:space="preserve"> </w:t></w:r>'

    for run in para_dict['runs']:
        bold = '<w:b/>' if run.get('bold') else ''
        run_sz = run.get('sz', style['font_size'])
        xml += f'<w:r><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>'
        xml += f'<w:sz w:val="{run_sz}"/>{bold}<w:color w:val="{color}"/></w:rPr>'
        xml += f'<w:t xml:space="preserve">{run["text"]}</w:t></w:r>'

    xml += '</w:p>'
    return xml

# ═══ HELPER: Calculate column widths based on content ═══
def calc_column_widths(headers, rows, footer_row, num_cols):
    """Calculate proportional column widths based on content length.
    Returns list of width percentages (sum = 5000 in pct units).
    """
    max_lengths = [0] * num_cols
    for i, h in enumerate(headers):
        label = h.get('label', h.get('key', ''))
        max_lengths[i] = max(max_lengths[i], len(str(label)))
    for row_data in rows:
        for i, h in enumerate(headers):
            val = str(row_data.get(h.get('key', ''), ''))
            max_lengths[i] = max(max_lengths[i], len(val))
    if footer_row:
        for i, h in enumerate(headers):
            val = str(footer_row.get(h.get('key', ''), ''))
            max_lengths[i] = max(max_lengths[i], len(val))

    # Ensure minimum width and cap maximum
    for i in range(num_cols):
        max_lengths[i] = max(max_lengths[i], 4)   # min 4 chars
        max_lengths[i] = min(max_lengths[i], 80)   # cap at 80

    total = sum(max_lengths) or 1
    # Convert to pct units (5000 = 100%)
    widths = [int((l / total) * 5000) for l in max_lengths]
    # Adjust rounding to exactly 5000
    diff = 5000 - sum(widths)
    if widths:
        widths[0] += diff
    return widths

# ═══ BUILD SECTION MAP ═══
section_map = {}
for s in sections:
    section_map[s['marker']] = s

# ═══ PHASE 1: Replace simple {{key}} placeholders ═══
all_filled = []

for para in doc.paragraphs:
    filled = replace_in_paragraph(para, elements)
    all_filled.extend(filled)

for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                filled = replace_in_paragraph(para, elements)
                all_filled.extend(filled)

for section in doc.sections:
    for header in [section.header, section.first_page_header]:
        if header:
            for para in header.paragraphs:
                replace_in_paragraph(para, elements)
    for footer in [section.footer, section.first_page_footer]:
        if footer:
            for para in footer.paragraphs:
                replace_in_paragraph(para, elements)

# ═══ PHASE 2: Replace COMPOSE/TABLE/CALC markers ═══
marker_prefixes = ['COMPOSE:', 'TABLE:', 'CALC:']

paragraphs_to_process = []
for i, para in enumerate(doc.paragraphs):
    text = para.text.strip()
    for prefix in marker_prefixes:
        marker_start = '{{' + prefix
        if marker_start in text:
            start = text.index(marker_start) + 2
            end = text.index('}}', start)
            marker = text[start:end]
            paragraphs_to_process.append((i, para, marker, prefix.rstrip(':')))

# Process markers in reverse order to preserve paragraph indices
for idx, para, marker, marker_type in reversed(paragraphs_to_process):
    section_data = section_map.get(marker)
    if not section_data:
        continue

    # Extract style from marker paragraph BEFORE clearing it
    inherited_style = extract_paragraph_style(para)
    # Override font with cascade
    inherited_style['font_name'] = BASE_FONT

    # Clear the marker paragraph
    for run in para.runs:
        run.text = ''

    para_element = para._element

    if marker_type == 'COMPOSE' and section_data.get('content'):
        content = section_data['content']
        # Parse rich text (markdown minimal → structured paragraphs)
        rich_paragraphs = parse_rich_text(content, inherited_style)

        insert_after = para_element
        for rp in rich_paragraphs:
            xml = build_rich_paragraph_xml(rp, inherited_style)
            try:
                new_para = parse_xml(xml)
                insert_after.addnext(new_para)
                insert_after = new_para
            except Exception as e:
                # Fallback: plain text without formatting
                fallback_text = ' '.join(r['text'] for r in rp.get('runs', []))
                font_n = esc(BASE_FONT)
                fallback_xml = (
                    f'<w:p {nsdecls("w")}>'
                    f'<w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr>'
                    f'<w:r><w:rPr><w:rFonts w:ascii="{font_n}" w:hAnsi="{font_n}"/>'
                    f'<w:sz w:val="22"/></w:rPr>'
                    f'<w:t xml:space="preserve">{fallback_text}</w:t></w:r>'
                    f'</w:p>'
                )
                try:
                    new_para = parse_xml(fallback_xml)
                    insert_after.addnext(new_para)
                    insert_after = new_para
                except:
                    pass

    elif marker_type in ('TABLE', 'CALC') and section_data.get('tableData'):
        td = section_data['tableData']
        headers = td.get('headers', [])
        rows = td.get('rows', [])
        highlight_rows = td.get('highlightRows', [])
        footer_row = td.get('footerRow')
        caption = td.get('caption', '')
        header_color = td.get('headerColor', '1a3a5c').lstrip('#')

        if not headers or not rows:
            continue

        num_cols = len(headers)
        col_widths = calc_column_widths(headers, rows, footer_row, num_cols)
        table_font = esc(TABLE_FONT)

        # Caption in the marker paragraph
        if caption:
            if para.runs:
                para.runs[0].text = caption
                para.runs[0].bold = True
                para.runs[0].font.size = Pt(10)
                para.runs[0].font.color.rgb = RGBColor(0x1a, 0x3a, 0x5c)
                para.runs[0].font.name = BASE_FONT
            else:
                run = para.add_run(caption)
                run.bold = True
                run.font.size = Pt(10)
                run.font.color.rgb = RGBColor(0x1a, 0x3a, 0x5c)
                run.font.name = BASE_FONT

        # Build all row data
        all_rows_data = [headers] + [[row_data.get(h.get('key', ''), '') for h in headers] for row_data in rows]
        if footer_row:
            all_rows_data.append([footer_row.get(h.get('key', ''), '') for h in headers])

        # Build OOXml table with column widths
        tbl_xml = f'<w:tbl {nsdecls("w")}>'
        tbl_xml += '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
        tbl_xml += '<w:tblBorders>'
        for border in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
            tbl_xml += f'<w:{border} w:val="single" w:sz="4" w:space="0" w:color="DEE2E6"/>'
        tbl_xml += '</w:tblBorders></w:tblPr>'
        # Grid columns with calculated widths
        tbl_xml += '<w:tblGrid>'
        for w in col_widths:
            tbl_xml += f'<w:gridCol w:w="{w}"/>'
        tbl_xml += '</w:tblGrid>'

        for r_idx, r_data in enumerate(all_rows_data):
            is_header_row = (r_idx == 0)
            is_footer_row = (footer_row and r_idx == len(all_rows_data) - 1)
            is_highlight = (r_idx - 1) in highlight_rows if r_idx > 0 and not is_footer_row else False
            is_alt = (r_idx % 2 == 0) and not is_header_row and not is_footer_row and not is_highlight

            tbl_xml += '<w:tr>'

            for c_idx in range(num_cols):
                if is_header_row:
                    cell_val = r_data[c_idx].get('label', r_data[c_idx].get('key', '')) if isinstance(r_data[c_idx], dict) else str(r_data[c_idx])
                else:
                    cell_val = str(r_data[c_idx]) if r_data[c_idx] is not None else ''

                cell_val = esc(cell_val)

                # Cell width
                width_xml = f'<w:tcW w:w="{col_widths[c_idx]}" w:type="pct"/>'

                # Cell shading
                shading = ''
                if is_header_row:
                    shading = f'<w:shd w:val="clear" w:color="auto" w:fill="{header_color}"/>'
                elif is_footer_row:
                    shading = '<w:shd w:val="clear" w:color="auto" w:fill="2C3E50"/>'
                elif is_highlight:
                    shading = '<w:shd w:val="clear" w:color="auto" w:fill="FFF3CD"/>'
                elif is_alt:
                    shading = '<w:shd w:val="clear" w:color="auto" w:fill="F8F9FA"/>'

                # Font color
                if is_header_row or is_footer_row:
                    font_color = 'FFFFFF'
                elif is_highlight:
                    font_color = '856D0E'
                else:
                    font_color = '1A1E28'

                bold_tag = '<w:b/>' if (is_header_row or is_footer_row or is_highlight) else ''

                # Detect numeric for right-alignment
                align_xml = ''
                try:
                    float(cell_val.replace(',', '.').replace(' ', '').replace('%', '').replace('&amp;', ''))
                    align_xml = '<w:jc w:val="right"/>'
                except (ValueError, AttributeError):
                    if is_header_row:
                        align_xml = '<w:jc w:val="center"/>'

                tbl_xml += '<w:tc>'
                tbl_xml += f'<w:tcPr>{width_xml}{shading}</w:tcPr>'
                tbl_xml += f'<w:p><w:pPr><w:spacing w:after="40" w:before="40"/>{align_xml}</w:pPr>'
                tbl_xml += f'<w:r><w:rPr><w:rFonts w:ascii="{table_font}" w:hAnsi="{table_font}"/>'
                tbl_xml += f'<w:sz w:val="18"/>{bold_tag}<w:color w:val="{font_color}"/></w:rPr>'
                tbl_xml += f'<w:t xml:space="preserve">{cell_val}</w:t></w:r>'
                tbl_xml += '</w:p></w:tc>'

            tbl_xml += '</w:tr>'

        tbl_xml += '</w:tbl>'

        try:
            tbl_element = parse_xml(tbl_xml)
            para_element.addnext(tbl_element)
        except Exception as e:
            if para.runs:
                para.runs[0].text = f'[EROARE TABEL: {str(e)[:100]}]'

# Also check inside tables for markers
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                replace_in_paragraph(para, elements)

# ═══ FINAL: Apply cabinet footer + watermark ═══
cab_footer = cabinet_style.get('footerText')
cab_draft_watermark = cabinet_style.get('draftWatermark', False)
cab_watermark_text = cabinet_style.get('draftWatermarkText', 'DRAFT')
cab_is_work_doc = cabinet_style.get('_isWorkDocument', True)

# Apply BASE_FONT to all AI-generated content (not template content which keeps its own fonts)
# This is already handled via the XML generation above using BASE_FONT

if cab_footer:
    for section in doc.sections:
        if section.footer:
            p = section.footer.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(cab_footer)
            run.font.size = Pt(8)
            run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)
            run.font.name = BASE_FONT

# Add DRAFT watermark on work documents
if cab_draft_watermark and cab_is_work_doc and cab_watermark_text:
    for section in doc.sections:
        header = section.header
        p = header.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        watermark_xml = f'''<w:r {nsdecls('w')}>
          <w:rPr>
            <w:color w:val="D0D0D0"/>
            <w:sz w:val="96"/>
            <w:szCs w:val="96"/>
          </w:rPr>
          <w:t>{esc(cab_watermark_text)}</w:t>
        </w:r>'''
        try:
            p._element.append(parse_xml(watermark_xml))
        except Exception:
            run = p.add_run(cab_watermark_text)
            run.font.size = Pt(48)
            run.font.color.rgb = RGBColor(0xD0, 0xD0, 0xD0)

doc.save(output_path)

filled_keys = list(set(all_filled))
composed_sections = [s['marker'] for s in sections]
report = {
    "filled_count": len(filled_keys),
    "filled_keys": filled_keys,
    "composed_sections": composed_sections,
    "total_sections": len(composed_sections),
    "base_font": BASE_FONT,
    "template_font_detected": TEMPLATE_FONT or "none"
}
print(json.dumps(report))
`;

// ═══ VALIDATE COMPOSE READINESS ═══
export async function validateComposeReadiness(
  projectId: string,
  templateDocumentId: string,
  organizationId: string,
): Promise<{
  canCompose: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    totalElements: number;
    filledElements: number;
    referenceTables: number;
    composeSections: number;
    checklistTotal: number;
    checklistDone: number;
    checklistCompleteness: number;
    missingCritical: string[];
    missingWarning: string[];
    missingInfo: string[];
  };
  sectionReadiness: Array<{
    sectionId: string;
    sectionTitle: string;
    requiredComplete: number;
    requiredTotal: number;
    requiredMissing: string[];
    optionalComplete: number;
    optionalTotal: number;
    readiness: number;
    qualityLevel: "full" | "partial" | "minimal";
  }>;
}> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check template has composeConfig
  const templateDoc = await db.query.documents.findFirst({
    where: eq(documents.id, templateDocumentId),
  });

  if (!templateDoc) {
    errors.push("Template-ul nu a fost găsit");
    return { canCompose: false, warnings, errors, stats: { totalElements: 0, filledElements: 0, referenceTables: 0, composeSections: 0, checklistTotal: 0, checklistDone: 0, checklistCompleteness: 100, missingCritical: [], missingWarning: [], missingInfo: [] }, sectionReadiness: [] };
  }

  const composeConfig = (templateDoc as any)?.composeConfig as any;
  if (!composeConfig?.sections || composeConfig.sections.length === 0) {
    errors.push("Template-ul nu are secțiuni COMPOSE configurate");
    return { canCompose: false, warnings, errors, stats: { totalElements: 0, filledElements: 0, referenceTables: 0, composeSections: 0, checklistTotal: 0, checklistDone: 0, checklistCompleteness: 100, missingCritical: [], missingWarning: [], missingInfo: [] }, sectionReadiness: [] };
  }

  // Check project elements
  const projEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });
  const filled = projEls.filter(pe => pe.value && pe.value.trim() !== "");

  if (filled.length === 0) {
    errors.push("Niciun element nu are valoare — rulați mai întâi Solomon pentru a popula datele");
  } else if (filled.length < 5) {
    warnings.push(`Doar ${filled.length} elemente au valori — conținutul generat va fi limitat`);
  }

  // Check reference tables
  const refTables = await db.query.guideReferenceTables.findMany({
    where: eq(guideReferenceTables.organizationId, organizationId),
  });

  if (refTables.length === 0) {
    warnings.push("Nu există tabele de referință din ghid — tabelele vor fi generate doar din elementele proiectului");
  }

  // Check unconfirmed elements
  const unconfirmed = filled.filter(pe => !pe.confirmed);
  if (unconfirmed.length > 0) {
    warnings.push(`${unconfirmed.length} elemente sunt neconfirmate — AI va folosi valorile propuse`);
  }

  // Check project checklist completeness
  const checklistItems = await db.select().from(projectChecklist)
    .where(eq(projectChecklist.projectId, projectId));

  const totalChecklist = checklistItems.length;
  const doneChecklist = checklistItems.filter(i => i.done).length;
  const undoneItems = checklistItems.filter(i => !i.done);

  const missingCritical: string[] = [];
  const missingWarning: string[] = [];
  const missingInfo: string[] = [];

  for (const item of undoneItems) {
    const nameLower = item.name.toLowerCase();
    if (CHECKLIST_CRITICALITY.critical.some(kw => nameLower.includes(kw))) {
      missingCritical.push(item.name);
    } else if (CHECKLIST_CRITICALITY.warning.some(kw => nameLower.includes(kw))) {
      missingWarning.push(item.name);
    } else {
      missingInfo.push(item.name);
    }
  }

  // Add warnings (NEVER block generation — informational only)
  if (missingCritical.length > 0) {
    warnings.push(`Lipsesc ${missingCritical.length} documente critice: ${missingCritical.join(', ')}. Documentul generat va fi incomplet.`);
  }
  if (missingWarning.length > 0) {
    warnings.push(`Documente opționale lipsă: ${missingWarning.join(', ')}. Ar îmbunătăți calitatea.`);
  }

  // Blueprint section-level readiness analysis (Gap 3)
  const sectionReadiness: Array<{
    sectionId: string;
    sectionTitle: string;
    requiredComplete: number;
    requiredTotal: number;
    requiredMissing: string[];
    optionalComplete: number;
    optionalTotal: number;
    readiness: number;
    qualityLevel: "full" | "partial" | "minimal";
  }> = [];

  const blueprint = (templateDoc as any)?.blueprint as DocumentBlueprint | null;
  if (blueprint?.sections) {
    // Build a set of element keys that have non-empty values
    // projectElements don't have a direct key — resolve via templateElements
    const tmplElIds = [...new Set(projEls.map(pe => pe.templateElementId).filter((id): id is string => id != null))];
    const allTmplEls = tmplElIds.length > 0
      ? await db.query.templateElements.findMany({ where: inArray(templateElements.id, tmplElIds) })
      : [];
    const tmplElMap = new Map(allTmplEls.map(t => [t.id, t.key]));

    const filledKeys = new Set<string>();
    for (const el of projEls) {
      if (el.value && String(el.value).trim() !== "" && el.templateElementId) {
        const key = tmplElMap.get(el.templateElementId);
        if (key) filledKeys.add(key);
      }
    }

    for (const section of blueprint.sections) {
      const reqKeys = section.requiredElementKeys || [];
      const optKeys = section.optionalElementKeys || [];

      const reqFilled = reqKeys.filter(k => filledKeys.has(k));
      const optFilled = optKeys.filter(k => filledKeys.has(k));
      const reqMissing = reqKeys.filter(k => !filledKeys.has(k));

      const readiness = reqKeys.length > 0 ? reqFilled.length / reqKeys.length : 1;
      const qualityLevel: "full" | "partial" | "minimal" = readiness >= 1 ? "full"
        : readiness >= 0.5 ? "partial"
        : "minimal";

      sectionReadiness.push({
        sectionId: section.sectionId,
        sectionTitle: section.title,
        requiredComplete: reqFilled.length,
        requiredTotal: reqKeys.length,
        requiredMissing: reqMissing,
        optionalComplete: optFilled.length,
        optionalTotal: optKeys.length,
        readiness: Math.round(readiness * 100) / 100,
        qualityLevel,
      });

      if (qualityLevel === "minimal") {
        warnings.push(`Secțiunea "${section.title}": doar ${reqFilled.length}/${reqKeys.length} date obligatorii completate.`);
      } else if (qualityLevel === "partial") {
        warnings.push(`Secțiunea "${section.title}": ${reqMissing.length} date obligatorii lipsă (${reqMissing.join(", ")}).`);
      }
    }
  }

  return {
    canCompose: errors.length === 0,
    warnings,
    errors,
    stats: {
      totalElements: projEls.length,
      filledElements: filled.length,
      referenceTables: refTables.length,
      composeSections: composeConfig.sections.length,
      checklistTotal: totalChecklist,
      checklistDone: doneChecklist,
      checklistCompleteness: totalChecklist > 0 ? Math.round((doneChecklist / totalChecklist) * 100) : 100,
      missingCritical,
      missingWarning,
      missingInfo,
    },
    sectionReadiness,
  };
}
