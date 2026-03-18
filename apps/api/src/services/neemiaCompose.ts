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
  projectChecklist,
} from "../db/schema";
import { eq, and, inArray, isNull, or, like } from "drizzle-orm";
import { getFileBuffer, uploadFile } from "./storage";
import { logAIUsage } from "./aiUsage";
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
  numberFormat: "ro" | "en";
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

  // Build elements map with metadata
  const elements: ComposeContext["elements"] = {};
  for (const pe of projEls) {
    if (!pe.templateElementId) continue;
    const te = tmplElMap.get(pe.templateElementId);
    if (te && pe.value) {
      elements[te.key] = {
        value: pe.value,
        label: te.label,
        source: pe.source,
      };
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

  return {
    projectName: project.name,
    companyName: company?.denumire || "N/A",
    companyCui: company?.cui || "N/A",
    programFinantare: project.programFinantare || "N/A",
    codMasura: project.codMasura || "N/A",
    numberFormat: (cabinetStyle.numberFormat as "ro" | "en") || "ro",
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

// ═══ AI CONTENT GENERATION ═══
// Calls Claude to generate narrative sections and table structures

async function generateComposeContent(
  context: ComposeContext,
  sections: Array<{
    marker: string;
    type: "narrative" | "table" | "calculation";
    label: string;
    instructions?: string;
    elementKeys?: string[];
    referenceTableIds?: string[];
  }>,
  aiModel: string,
  organizationId: string,
  userId: string,
  blueprint?: DocumentBlueprint | null,
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

  // Load writing kit from solomonKnowledge (global + org-specific)
  const writingKit = await db.select().from(solomonKnowledge)
    .where(and(
      like(solomonKnowledge.category, "wk_%"),
      eq(solomonKnowledge.enabled, true),
      or(
        isNull(solomonKnowledge.organizationId),
        eq(solomonKnowledge.organizationId, organizationId),
      ),
    ));

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

  const writingKitContext = writingKit.length > 0
    ? writingKit.map(wk => {
        try {
          const parsed = JSON.parse(wk.content);
          return `## ${wk.title}\n${JSON.stringify(parsed, null, 2)}`;
        } catch {
          return `## ${wk.title}\n${wk.content}`;
        }
      }).join("\n\n")
    : "";

  const systemPrompt = `Ești Neemia, un expert senior în redactarea documentelor pentru proiecte cu finanțare europeană (fonduri AFIR/PNDR/PNRR).
Scrii documente profesionale care respectă standardele AFIR/PNRR — ca un consultant cu 10+ ani experiență.

REGULI STRICTE:
1. Scrii EXCLUSIV în limba română, cu terminologie profesională de consultanță fonduri europene.
2. Conținutul trebuie să fie factual — bazat STRICT pe datele furnizate (elements, reference tables).
3. NU inventa date, cifre sau informații care nu sunt în context.
4. Folosește formatul solicitat (narrative SAU table) exact cum e cerut.
5. Pentru tabele: returnează structura JSON exactă (headers + rows), nu text.
6. Pentru narrative: scrie profesional, concis, cu argumente bazate pe date.
7. Argumentează legătura între datele proiectului și regulile din ghidul de finanțare.
8. Evidențiază (prin highlight) rândurile din tabele care sunt relevante pentru proiect.
9. Dacă o dată lipsește, marchează cu {{PLACEHOLDER_DESCRIERE}} — nu inventa.
10. Numere formatate ${context.numberFormat === "en" ? "EN: 1,234,567.89 RON (virgulă separare mii, punct zecimale)" : "RO: 1.234.567,89 RON (punct separare mii, virgulă zecimale)"}.
${writingKitContext ? `
WRITING KIT — Terminologie și keywords profesionale:
${writingKitContext}
` : ""}${cabinetPreferences}
CONTEXT PROIECT:
- Nume proiect: ${context.projectName}
- Firmă: ${context.companyName} (CUI: ${context.companyCui})
- Program: ${context.programFinantare}
- Măsură: ${context.codMasura}

ELEMENTE PROIECT (valori completate):
${elementsList}

TABELE DE REFERINȚĂ DIN GHID:
${tablesList}

REGULI RELEVANTE:
${rulesList}`;

  const userPrompt = `Generează conținutul pentru următoarele secțiuni ale documentului.

IMPORTANT: Răspunde cu un JSON valid care conține un array "sections", unde fiecare secțiune are:
- "marker": string (marker-ul secțiunii)
- "type": "narrative" | "table" | "calculation"
- Pentru NARRATIVE: "content" (string cu textul narativ, paragrafe separate cu \\n\\n)
- Pentru TABLE/CALCULATION: "tableData" cu:
  - "headers": [{key, label}]
  - "rows": [{ key1: val1, key2: val2, ... }]
  - "highlightRows": [indexuri rânduri de evidențiat]  (opțional)
  - "footerRow": {key1: val1, ...}  (rând total/sumar, opțional)
  - "caption": string (titlu tabel, opțional)
  - "headerColor": string hex (culoare header, default "#1a3a5c")

SECȚIUNI DE GENERAT:
${sectionsRequest}

INSTRUCȚIUNI:
- Folosește keywords-urile din writing kit relevante pentru criteriile de selecție ale proiectului.
- Scrie în română, cu date concrete din contextul de mai sus.
- Dacă datele sunt insuficiente pentru o secțiune, marchează lipsurile cu {{PLACEHOLDER_DESCRIERE}}.

Răspunde DOAR cu JSON-ul, fără markdown code blocks, fără text suplimentar.`;

  const response = await withAILimit(() => anthropic.messages.create({
    model: aiModel,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  }));

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
  const textContent = response.content.find(c => c.type === "text");
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

// ═══ COMPOSE DOCUMENT (main flow, SSE streaming) ═══

export async function composeDocument(params: ComposeDocParams): Promise<ReadableStream> {
  const { projectId, templateDocumentId, organizationId, userId, previewOnly, editedSections } = params;
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
        const aiModel = composeConfig.aiModel || config?.neemiaModel || "claude-sonnet-4-20250514";

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

        // Step 1: Generate AI content (or use edited sections)
        let composeSections: ComposeSection[];
        let tokensUsed = 0;

        if (editedSections && editedSections.length > 0) {
          emit({ type: "status", message: "Se folosesc secțiunile editate de consultant..." });
          composeSections = editedSections;
        } else {
          emit({ type: "status", message: `Se generează conținutul cu ${aiModel}...` });

          const templateBlueprint = (templateDoc as any)?.blueprint as DocumentBlueprint | null;
          const aiResult = await generateComposeContent(
            context,
            composeConfig.sections,
            aiModel,
            organizationId,
            userId,
            templateBlueprint,
          );

          composeSections = aiResult.sections;
          tokensUsed = aiResult.tokensInput + aiResult.tokensOutput;

          emit({
            type: "ai_complete",
            sections: composeSections,
            tokensUsed,
            model: aiModel,
          });

          // Warn about unresolved placeholders
          if (aiResult.placeholders && aiResult.placeholders.length > 0) {
            emit({
              type: "compose_warning",
              message: `${aiResult.placeholders.length} câmpuri necompletate detectate — marchează date lipsă`,
              missing: aiResult.placeholders,
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

        // Build elements map for simple {{key}} replacements
        const simpleElements: Record<string, string> = {};
        for (const [key, { value }] of Object.entries(context.elements)) {
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
import sys, json
from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml

template_path = sys.argv[1]
output_path = sys.argv[2]
data_path = sys.argv[3]

with open(data_path, 'r', encoding='utf-8') as f:
    payload = json.load(f)

elements = payload.get('elements', {})
sections = payload.get('sections', [])
cabinet_style = payload.get('cabinetStyle', {})

doc = Document(template_path)

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

# ═══ HELPER: Set cell shading ═══
def set_cell_shading(cell, color_hex):
    """Set background color of a table cell."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

# ═══ HELPER: Set cell borders ═══
def set_cell_border(cell, **kwargs):
    """Set cell borders. kwargs: top, bottom, left, right, each a dict with val, sz, color."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = parse_xml(f'<w:tcBorders {nsdecls("w")}></w:tcBorders>')
    for edge, attrs in kwargs.items():
        element = parse_xml(
            f'<w:{edge} {nsdecls("w")} w:val="{attrs.get("val", "single")}" '
            f'w:sz="{attrs.get("sz", "4")}" w:space="0" '
            f'w:color="{attrs.get("color", "000000")}"/>'
        )
        tcBorders.append(element)
    tcPr.append(tcBorders)

# ═══ HELPER: Add a professional formatted table ═══
def add_formatted_table(doc, section, insert_after=None):
    """Insert a professionally formatted table into the document."""
    td = section.get('tableData', {})
    if not td:
        return

    headers = td.get('headers', [])
    rows = td.get('rows', [])
    highlight_rows = td.get('highlightRows', [])
    footer_row = td.get('footerRow')
    caption = td.get('caption', '')
    header_color = td.get('headerColor', '1a3a5c').lstrip('#')

    if not headers or not rows:
        return

    num_cols = len(headers)
    total_rows = len(rows) + 1 + (1 if footer_row else 0)

    # Add caption as paragraph before table
    if caption:
        p_caption = doc.add_paragraph()
        run = p_caption.add_run(caption)
        run.bold = True
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x1a, 0x3a, 0x5c)
        p_caption.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_caption.space_after = Pt(4)

    # Create table
    table = doc.add_table(rows=total_rows, cols=num_cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    # Style header row
    header_row_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        cell = header_row_cells[i]
        cell.text = ''
        p = cell.paragraphs[0]
        run = p.add_run(h.get('label', h.get('key', '')))
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.name = 'DM Sans'
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        # Header background
        set_cell_shading(cell, header_color)

    # Data rows
    for row_idx, row_data in enumerate(rows):
        row_cells = table.rows[row_idx + 1].cells
        is_highlight = row_idx in highlight_rows

        for col_idx, h in enumerate(headers):
            cell = row_cells[col_idx]
            key = h.get('key', '')
            value = str(row_data.get(key, ''))
            cell.text = ''
            p = cell.paragraphs[0]
            run = p.add_run(value)
            run.font.size = Pt(9)
            run.font.name = 'DM Sans'

            if is_highlight:
                # Highlight row: light yellow background + bold
                set_cell_shading(cell, 'FFF3CD')
                run.bold = True
                run.font.color.rgb = RGBColor(0x85, 0x6D, 0x0E)
            else:
                # Alternate row shading
                if row_idx % 2 == 1:
                    set_cell_shading(cell, 'F8F9FA')

            # Right-align numeric values
            try:
                float(value.replace(',', '.').replace(' ', '').replace('%', ''))
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            except (ValueError, AttributeError):
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT

    # Footer row (totals)
    if footer_row:
        footer_cells = table.rows[-1].cells
        for col_idx, h in enumerate(headers):
            cell = footer_cells[col_idx]
            key = h.get('key', '')
            value = str(footer_row.get(key, ''))
            cell.text = ''
            p = cell.paragraphs[0]
            run = p.add_run(value)
            run.bold = True
            run.font.size = Pt(9)
            run.font.name = 'DM Sans'
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            set_cell_shading(cell, '2C3E50')

    # Add thin borders to all cells
    for row in table.rows:
        for cell in row.cells:
            set_cell_border(cell,
                top={"val": "single", "sz": "4", "color": "DEE2E6"},
                bottom={"val": "single", "sz": "4", "color": "DEE2E6"},
                left={"val": "single", "sz": "4", "color": "DEE2E6"},
                right={"val": "single", "sz": "4", "color": "DEE2E6"},
            )

    # Space after table
    p_after = doc.add_paragraph()
    p_after.space_before = Pt(6)

    return table

# ═══ HELPER: Add narrative paragraphs ═══
def add_narrative(doc, content):
    """Insert AI-generated narrative text, splitting by double newlines into paragraphs."""
    if not content:
        return
    paragraphs = content.split('\\n\\n')
    for text in paragraphs:
        text = text.strip()
        if not text:
            continue
        p = doc.add_paragraph()
        run = p.add_run(text)
        run.font.size = Pt(11)
        run.font.name = 'DM Sans'
        run.font.color.rgb = RGBColor(0x1a, 0x1e, 0x28)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = Pt(15)

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
# Find paragraphs containing {{COMPOSE:...}}, {{TABLE:...}}, {{CALC:...}}
marker_prefixes = ['COMPOSE:', 'TABLE:', 'CALC:']

paragraphs_to_process = []
for i, para in enumerate(doc.paragraphs):
    text = para.text.strip()
    for prefix in marker_prefixes:
        marker_start = '{{' + prefix
        if marker_start in text:
            # Extract full marker
            start = text.index(marker_start) + 2
            end = text.index('}}', start)
            marker = text[start:end]
            paragraphs_to_process.append((i, para, marker, prefix.rstrip(':')))

# Process markers in reverse order to preserve paragraph indices
for idx, para, marker, marker_type in reversed(paragraphs_to_process):
    section_data = section_map.get(marker)
    if not section_data:
        # Leave marker as-is if no AI content
        continue

    # Clear the marker paragraph
    for run in para.runs:
        run.text = ''

    # Get the paragraph's parent element to insert after
    parent = para._element.getparent()
    para_element = para._element

    if marker_type == 'COMPOSE' and section_data.get('content'):
        # Insert narrative paragraphs after the marker position
        content = section_data['content']
        paragraphs_text = content.split('\\n\\n')

        insert_after = para_element
        for text in paragraphs_text:
            text = text.strip()
            if not text:
                continue
            # Create new paragraph element
            new_para = parse_xml(
                f'<w:p {nsdecls("w")}>'
                f'<w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr>'
                f'<w:r><w:rPr><w:rFonts w:ascii="DM Sans" w:hAnsi="DM Sans"/>'
                f'<w:sz w:val="22"/><w:color w:val="1A1E28"/></w:rPr>'
                f'<w:t xml:space="preserve">{text}</w:t></w:r>'
                f'</w:p>'
            )
            insert_after.addnext(new_para)
            insert_after = new_para

    elif marker_type in ('TABLE', 'CALC') and section_data.get('tableData'):
        # For tables, we need to insert after the paragraph
        # We'll use the document body to find position and insert table XML
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

        # Add caption in the marker paragraph itself
        if caption:
            if para.runs:
                para.runs[0].text = caption
                para.runs[0].bold = True
                para.runs[0].font.size = Pt(10)
                para.runs[0].font.color.rgb = RGBColor(0x1a, 0x3a, 0x5c)
            else:
                run = para.add_run(caption)
                run.bold = True
                run.font.size = Pt(10)
                run.font.color.rgb = RGBColor(0x1a, 0x3a, 0x5c)

        # Build table XML
        all_rows = [headers] + [[row_data.get(h.get('key', ''), '') for h in headers] for row_data in rows]
        if footer_row:
            all_rows.append([footer_row.get(h.get('key', ''), '') for h in headers])

        # Build OOXml table
        tbl_xml = f'<w:tbl {nsdecls("w")}>'
        tbl_xml += '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
        tbl_xml += '<w:tblBorders>'
        for border in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
            tbl_xml += f'<w:{border} w:val="single" w:sz="4" w:space="0" w:color="DEE2E6"/>'
        tbl_xml += '</w:tblBorders></w:tblPr>'
        tbl_xml += f'<w:tblGrid>{"".join(f"<w:gridCol/>" for _ in range(num_cols))}</w:tblGrid>'

        for r_idx, r_data in enumerate(all_rows):
            is_header = (r_idx == 0)
            is_footer = (footer_row and r_idx == len(all_rows) - 1)
            is_highlight = (r_idx - 1) in highlight_rows if r_idx > 0 and not is_footer else False
            is_alt = (r_idx % 2 == 0) and not is_header and not is_footer and not is_highlight

            tbl_xml += '<w:tr>'

            for c_idx in range(num_cols):
                if is_header:
                    cell_val = r_data[c_idx].get('label', r_data[c_idx].get('key', '')) if isinstance(r_data[c_idx], dict) else str(r_data[c_idx])
                else:
                    cell_val = str(r_data[c_idx]) if r_data[c_idx] is not None else ''

                # Escape XML special chars
                cell_val = cell_val.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

                # Cell shading
                shading = ''
                if is_header:
                    shading = f'<w:shd w:val="clear" w:color="auto" w:fill="{header_color}"/>'
                elif is_footer:
                    shading = '<w:shd w:val="clear" w:color="auto" w:fill="2C3E50"/>'
                elif is_highlight:
                    shading = '<w:shd w:val="clear" w:color="auto" w:fill="FFF3CD"/>'
                elif is_alt:
                    shading = '<w:shd w:val="clear" w:color="auto" w:fill="F8F9FA"/>'

                # Font color
                if is_header or is_footer:
                    font_color = 'FFFFFF'
                elif is_highlight:
                    font_color = '856D0E'
                else:
                    font_color = '1A1E28'

                bold_tag = '<w:b/>' if (is_header or is_footer or is_highlight) else ''

                tbl_xml += '<w:tc>'
                tbl_xml += f'<w:tcPr>{shading}</w:tcPr>'
                tbl_xml += f'<w:p><w:pPr><w:spacing w:after="40" w:before="40"/></w:pPr>'
                tbl_xml += f'<w:r><w:rPr><w:rFonts w:ascii="DM Sans" w:hAnsi="DM Sans"/>'
                tbl_xml += f'<w:sz w:val="18"/>{bold_tag}<w:color w:val="{font_color}"/></w:rPr>'
                tbl_xml += f'<w:t xml:space="preserve">{cell_val}</w:t></w:r>'
                tbl_xml += '</w:p></w:tc>'

            tbl_xml += '</w:tr>'

        tbl_xml += '</w:tbl>'

        try:
            tbl_element = parse_xml(tbl_xml)
            para_element.addnext(tbl_element)
        except Exception as e:
            # Fallback: just note the error in the marker paragraph
            if para.runs:
                para.runs[0].text = f'[EROARE TABEL: {str(e)[:100]}]'

# Also check inside tables for markers
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                replace_in_paragraph(para, elements)

# Apply cabinet document style
cab_font = cabinet_style.get('fontFamily')
cab_footer = cabinet_style.get('footerText')
cab_draft_watermark = cabinet_style.get('draftWatermark', False)
cab_watermark_text = cabinet_style.get('draftWatermarkText', 'DRAFT')
cab_is_work_doc = cabinet_style.get('_isWorkDocument', True)

if cab_font:
    for para in doc.paragraphs:
        for run in para.runs:
            if run.font and run.text.strip():
                run.font.name = cab_font
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for run in para.runs:
                        if run.font and run.text.strip():
                            run.font.name = cab_font

if cab_footer:
    for section in doc.sections:
        if section.footer:
            p = section.footer.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(cab_footer)
            run.font.size = Pt(8)
            run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)
            if cab_font:
                run.font.name = cab_font

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
          <w:t>{cab_watermark_text}</w:t>
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
    "total_sections": len(composed_sections)
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
