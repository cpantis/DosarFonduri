/**
 * Solomon tool definitions and handlers.
 *
 * Tools:
 *   search_documents       — full-text search in document chapters
 *   get_session_documents   — list documents with briefs
 *   save_element           — extract and save a project element
 *   check_eligibility      — verify and persist eligibility rule
 *   estimate_score         — estimate scoring criterion
 *   compose_section        — generate document section text
 *
 * Called by Solomon via Anthropic native tool_use API.
 */
import { searchChapters, getSessionBriefs } from "./chapterSearch";
import { hybridSearch } from "./hybridSearch";
import { db } from "../db";
import { documents, projectElements, elementDefinitions, solomonEligibility, solomonScoring, projects, projectChecklist } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "./aiUsage";

// ═══════════════════════════════════════════
// TOOL DEFINITIONS for Anthropic API
// ═══════════════════════════════════════════

export const SOLOMON_TOOLS = [
  {
    name: "search_documents" as const,
    description: "Caută informații în documentele sesiunii (ghid, fișă evaluare, anexe) și baza de cunoștințe. Caută MEREU înainte să afirmi ceva despre regulile ghidului, criterii de selecție, cheltuieli eligibile, sau intensitatea sprijinului.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Ce cauți, în română, cât mai specific",
        },
        document_id: {
          type: "string" as const,
          description: "Opțional: ID-ul unui document specific în care să cauți",
        },
        top_k: {
          type: "integer" as const,
          description: "Câte rezultate (default 8, max 15)",
        },
      },
      required: ["query" as const],
    },
  },
  {
    name: "get_session_documents" as const,
    description: "Vezi ce documente sunt pe sesiune cu rezumatele lor. Folosește la început sau când trebuie context general.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "save_element" as const,
    description: "Salvează o informație extrasă din conversație ca element de proiect. Folosește după ce ai obținut o dată concretă de la consultant sau dintr-un document.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string" as const,
          description: "Cheia elementului (ex: cifra_afaceri, numar_angajati, cnp)",
        },
        value: {
          type: "string" as const,
          description: "Valoarea extrasă",
        },
        confidence: {
          type: "number" as const,
          description: "Încredere 0.0-1.0 (din document: 0.9+, dedus: 0.7, propus: 0.5)",
        },
      },
      required: ["key" as const, "value" as const],
    },
  },
  {
    name: "check_eligibility" as const,
    description: "Verifică și salvează o condiție de eligibilitate. Folosește când evaluezi dacă firma/proiectul îndeplinește o cerință din ghid.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule: {
          type: "string" as const,
          description: "Denumirea condiției de eligibilitate",
        },
        status: {
          type: "string" as const,
          enum: ["pass", "fail", "pending"],
          description: "pass=îndeplinit, fail=neîndeplinit, pending=date insuficiente",
        },
        evidence: {
          type: "string" as const,
          description: "Explicație scurtă cu dovezi concrete",
        },
        confidence: {
          type: "number" as const,
          description: "Încredere 0.0-1.0",
        },
      },
      required: ["rule" as const, "status" as const, "evidence" as const],
    },
  },
  {
    name: "estimate_score" as const,
    description: "Estimează punctajul pentru un criteriu de selecție. Folosește când evaluezi câte puncte poate obține proiectul.",
    input_schema: {
      type: "object" as const,
      properties: {
        criterion: {
          type: "string" as const,
          description: "Denumirea criteriului de selecție",
        },
        points: {
          type: "number" as const,
          description: "Puncte estimate",
        },
        max_points: {
          type: "number" as const,
          description: "Punctaj maxim posibil pentru acest criteriu",
        },
        evidence: {
          type: "string" as const,
          description: "Justificare scurtă",
        },
        confidence: {
          type: "number" as const,
          description: "Încredere estimare 0.0-1.0",
        },
      },
      required: ["criterion" as const, "points" as const, "max_points" as const, "evidence" as const],
    },
  },
  {
    name: "compose_section" as const,
    description: "Generează text pentru o secțiune de document (memoriu, plan afaceri, etc.). Folosește când consultantul cere redactarea unei părți din dosar.",
    input_schema: {
      type: "object" as const,
      properties: {
        section_title: {
          type: "string" as const,
          description: "Titlul secțiunii (ex: 'Context și justificare', 'Obiective', 'Metodologie')",
        },
        instructions: {
          type: "string" as const,
          description: "Instrucțiuni specifice pentru redactare",
        },
        max_words: {
          type: "integer" as const,
          description: "Număr maxim de cuvinte (default 500)",
        },
      },
      required: ["section_title" as const, "instructions" as const],
    },
  },
  {
    name: "update_phase" as const,
    description: "Actualizează faza conversației (Q0-Q11). Apelează la FIECARE răspuns.",
    input_schema: {
      type: "object" as const,
      properties: {
        phase: { type: "string" as const, description: "Faza: Q0, Q1, ..., Q11" },
        label: { type: "string" as const, description: "Descriere scurtă a fazei" },
        progress: { type: "integer" as const, description: "Progres 0-100" },
        next_action: { type: "string" as const, description: "Ce urmează" },
        regression_from: { type: "string" as const, description: "Faza anterioară dacă e regresie" },
        regression_reason: { type: "string" as const, description: "Motivul regresiei" },
      },
      required: ["phase" as const, "label" as const, "progress" as const],
    },
  },
  {
    name: "update_metadata" as const,
    description: "Salvează metadate proiect (program, măsură, sesiune, nomenclator). Apelează când consultantul confirmă aceste informații.",
    input_schema: {
      type: "object" as const,
      properties: {
        program_finantare: { type: "string" as const },
        cod_masura: { type: "string" as const },
        cod_sesiune: { type: "string" as const },
        cod_nomenclator: { type: "string" as const },
        prefix_documente: { type: "string" as const },
        cod_mysmis: { type: "string" as const },
        tip_proiect: { type: "string" as const },
        structura_dosar: { type: "string" as const },
      },
      required: [] as const,
    },
  },
  {
    name: "update_checklist" as const,
    description: "Adaugă un document necesar la checklist-ul proiectului.",
    input_schema: {
      type: "object" as const,
      properties: {
        document: { type: "string" as const, description: "Numele documentului" },
        category: { type: "string" as const, enum: ["obligatoriu_depunere", "obligatoriu_contractare", "optional"] },
        reference: { type: "string" as const, description: "Referință ghid" },
        notes: { type: "string" as const, description: "Note suplimentare" },
      },
      required: ["document" as const],
    },
  },
];

// ═══════════════════════════════════════════
// CONTEXT TYPE
// ═══════════════════════════════════════════

export interface ToolContext {
  cabinetId: string;
  sessionId: string;  // folderId
  projectId: string;
  organizationId: string;
  companyName?: string;
  projectName?: string;
}

// ═══════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════

async function handleSearchDocuments(
  input: { query: string; document_id?: string; top_k?: number },
  ctx: ToolContext,
): Promise<string> {
  const topK = Math.min(input.top_k || 8, 15);

  // Search in document chapters (primary — structured chapter search)
  const chapterResults = await searchChapters({
    query: input.query,
    organizationId: ctx.organizationId,
    documentId: input.document_id,
    folderId: ctx.sessionId || undefined,
    topK: Math.ceil(topK * 0.6),
  });

  // Also search in legacy chunks table (knowledge base + session chunks)
  let chunkResults: any[] = [];
  try {
    chunkResults = await hybridSearch({
      query: input.query,
      cabinetId: ctx.cabinetId,
      sessionId: ctx.sessionId,
      topK: Math.ceil(topK * 0.4),
    });
  } catch {
    // chunks table may not have content_tsv column yet
  }

  if (chapterResults.length === 0 && chunkResults.length === 0) {
    return "Nu am găsit informații relevante. Încearcă cu alți termeni.";
  }

  const parts: string[] = [];

  for (const r of chapterResults) {
    const loc = [
      r.documentName && `📄 ${r.documentName}`,
      r.title && `§ ${r.title}`,
      r.pageStart && `pag. ${r.pageStart}${r.pageEnd && r.pageEnd !== r.pageStart ? `-${r.pageEnd}` : ""}`,
    ].filter(Boolean).join(" · ");
    parts.push(`[${parts.length + 1}] ${loc}\n${r.content.slice(0, 1500)}`);
  }

  for (const r of chunkResults) {
    const meta = (r.metadata || {}) as Record<string, any>;
    const loc = [
      meta.section && `§ ${meta.section}`,
      meta.page && `pag. ${meta.page}`,
      meta.doc_type && `${meta.doc_type}`,
    ].filter(Boolean).join(" · ");
    parts.push(`[${parts.length + 1}] ${loc}\n${r.content.slice(0, 1500)}`);
  }

  return parts.join("\n\n---\n\n");
}

async function handleGetSessionDocuments(ctx: ToolContext): Promise<string> {
  // Get briefs for all documents in session
  const briefs = ctx.sessionId
    ? await getSessionBriefs(ctx.sessionId, ctx.organizationId)
    : [];

  // Also get raw document list
  const docs = ctx.sessionId
    ? await db.query.documents.findMany({
        where: and(eq(documents.folderId, ctx.sessionId), eq(documents.organizationId, ctx.organizationId)),
      })
    : [];

  if (docs.length === 0) {
    return "Nu sunt documente încărcate pe această sesiune.";
  }

  const briefMap = new Map(briefs.map(b => [b.documentId, b]));

  return docs.map(doc => {
    const status = doc.status === "processed" ? "✅" : doc.status === "processing" ? "⏳" : "📄";
    const brief = briefMap.get(doc.id);
    const briefText = brief ? `\n  Rezumat: ${brief.brief.slice(0, 200)}...` : "";
    const chapters = brief ? ` (${brief.chapterCount} capitole)` : "";
    return `${status} ${doc.name}${chapters}${briefText}`;
  }).join("\n\n");
}

async function handleSaveElement(
  input: { key: string; value: string; confidence?: number },
  ctx: ToolContext,
): Promise<string> {
  // Input validation
  if (!input.key || typeof input.key !== "string" || input.key.length > 255) {
    return "Eroare: cheia elementului lipsește sau e prea lungă (max 255 caractere).";
  }
  if (!input.value || typeof input.value !== "string") {
    return "Eroare: valoarea elementului lipsește.";
  }
  const key = input.key.trim().slice(0, 255);
  const value = input.value.trim().slice(0, 10000);
  if (!key || !value) return "Eroare: cheia sau valoarea nu poate fi goală.";
  const confidence = Math.min(1, Math.max(0, input.confidence || 0.5));

  // Find existing element definition
  const elemDef = await db.query.elementDefinitions.findFirst({
    where: and(
      eq(elementDefinitions.elementKey, key),
      eq(elementDefinitions.organizationId, ctx.organizationId),
    ),
  });

  // Find existing project element
  const existing = elemDef
    ? await db.query.projectElements.findFirst({
        where: and(
          eq(projectElements.projectId, ctx.projectId),
          eq(projectElements.elementDefId, elemDef.id),
        ),
      })
    : null;

  if (existing) {
    await db.update(projectElements).set({
      value,
      source: "solomon_chat",
      confirmed: false,
      validationStatus: "pending",
    }).where(eq(projectElements.id, existing.id));
    return `Actualizat: ${elemDef?.displayName || key} = ${value} (confidence: ${confidence})`;
  }

  if (!elemDef) {
    return `Element necunoscut: "${key}". Verifică dacă cheia e corectă.`;
  }

  // Insert new
  await db.insert(projectElements).values({
    projectId: ctx.projectId,
    elementDefId: elemDef.id,
    value,
    source: "solomon_chat",
    confirmed: false,
    validationStatus: "pending",
  });

  return `Salvat: ${elemDef.displayName || key} = ${value} (confidence: ${confidence})`;
}

async function handleCheckEligibility(
  input: { rule: string; status: string; evidence: string; confidence?: number },
  ctx: ToolContext,
): Promise<string> {
  if (!input.rule || typeof input.rule !== "string" || input.rule.length > 500) {
    return "Eroare: denumirea regulii lipsește sau e prea lungă.";
  }
  if (!["pass", "fail", "pending"].includes(input.status)) {
    return "Eroare: status invalid. Valori acceptate: pass, fail, pending.";
  }
  const evidence = (input.evidence || "").slice(0, 2000);
  const confidence = Math.min(1, Math.max(0, input.confidence || 0.8));

  // Upsert in solomon_eligibility
  const existing = await db.query.solomonEligibility.findFirst({
    where: and(
      eq(solomonEligibility.projectId, ctx.projectId),
      eq(solomonEligibility.ruleName, input.rule),
    ),
  });

  if (existing) {
    await db.update(solomonEligibility).set({
      status: input.status,
      evidence,
      confidence: confidence.toString(),
    }).where(eq(solomonEligibility.id, existing.id));
  } else {
    await db.insert(solomonEligibility).values({
      projectId: ctx.projectId,
      ruleName: input.rule.slice(0, 500),
      status: input.status,
      evidence,
      confidence: confidence.toString(),
    });
  }

  const icon = input.status === "pass" ? "✅" : input.status === "fail" ? "❌" : "⏳";
  return `${icon} ${input.rule}: ${input.status} — ${input.evidence}`;
}

async function handleEstimateScore(
  input: { criterion: string; points: number; max_points: number; evidence: string; confidence?: number },
  ctx: ToolContext,
): Promise<string> {
  if (!input.criterion || typeof input.criterion !== "string" || input.criterion.length > 500) {
    return "Eroare: denumirea criteriului lipsește sau e prea lungă.";
  }
  const points = Math.max(0, Math.min(1000, Math.round(input.points || 0)));
  const maxPoints = Math.max(0, Math.min(1000, Math.round(input.max_points || 0)));
  const evidence = (input.evidence || "").slice(0, 2000);
  const confidence = Math.min(1, Math.max(0, input.confidence || 0.7));

  const existing = await db.query.solomonScoring.findFirst({
    where: and(
      eq(solomonScoring.projectId, ctx.projectId),
      eq(solomonScoring.criterionName, input.criterion),
    ),
  });

  if (existing) {
    await db.update(solomonScoring).set({
      pointsEstimated: points,
      maxPoints: maxPoints,
      evidence,
      confidence: confidence.toString(),
    }).where(eq(solomonScoring.id, existing.id));
  } else {
    await db.insert(solomonScoring).values({
      projectId: ctx.projectId,
      criterionName: input.criterion.slice(0, 500),
      pointsEstimated: points,
      maxPoints: maxPoints,
      evidence,
      confidence: confidence.toString(),
    });
  }

  return `📊 ${input.criterion}: ${points}/${maxPoints} puncte — ${evidence.slice(0, 100)}`;
}

async function handleComposeSection(
  input: { section_title: string; instructions: string; max_words?: number },
  ctx: ToolContext,
): Promise<string> {
  if (!input.section_title || typeof input.section_title !== "string") {
    return "Eroare: titlul secțiunii lipsește.";
  }
  if (!input.instructions || typeof input.instructions !== "string") {
    return "Eroare: instrucțiunile lipsesc.";
  }
  const sectionTitle = input.section_title.slice(0, 200);
  const instructions = input.instructions.slice(0, 5000);
  const maxWords = Math.min(input.max_words || 500, 2000);

  // Get relevant context from chapters
  const context = await searchChapters({
    query: sectionTitle + " " + instructions,
    organizationId: ctx.organizationId,
    folderId: ctx.sessionId || undefined,
    topK: 5,
  });

  const contextText = context.map(c => `[${c.documentName}] ${c.content.slice(0, 800)}`).join("\n\n");

  const response: any = await withAILimit(async () => {
    return anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxWords * 5,
      system: `Ești un redactor expert pentru dosare de fonduri europene. Scrii texte narative profesionale, formal-tehnice, cu cifre concrete și terminologie oficială. Scrie la persoana a III-a ("Solicitantul", "Societatea"). Fiecare paragraf: o singură idee + date concrete. Folosește conectori logici. Max ${maxWords} cuvinte. DOAR textul secțiunii, fără preambul.`,
      messages: [{
        role: "user",
        content: `Scrie secțiunea "${sectionTitle}" pentru proiectul "${ctx.projectName || ""}".

Firma: ${ctx.companyName || ""}

Instrucțiuni: ${instructions}

Context din documente:
${contextText.slice(0, 10000)}`,
      }],
    });
  }, "batch");

  const textBlock = (response as any).content?.find((b: any) => b.type === "text");
  const sectionText = textBlock?.text || "";

  await logAIUsage({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    agent: "neemia",
    model: "claude-sonnet-4-6",
    tokensInput: (response as any).usage?.input_tokens || 0,
    tokensOutput: (response as any).usage?.output_tokens || 0,
    action: `compose_${sectionTitle.slice(0, 30)}`,
  });

  return sectionText;
}

async function handleUpdatePhase(
  input: { phase: string; label: string; progress: number; next_action?: string; regression_from?: string; regression_reason?: string },
  ctx: ToolContext,
): Promise<string> {
  const phaseRecord: any = {
    phase: (input.phase || "Q0").slice(0, 10),
    label: (input.label || "").slice(0, 200),
    progress: Math.min(100, Math.max(0, input.progress || 0)),
    nextAction: (input.next_action || "").slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  if (input.regression_from) {
    phaseRecord.regression = {
      from: input.regression_from.slice(0, 10),
      reason: (input.regression_reason || "").slice(0, 500),
    };
  }
  await db.update(projects)
    .set({ solomonPhase: phaseRecord })
    .where(and(eq(projects.id, ctx.projectId), eq(projects.organizationId, ctx.organizationId)));
  return `Faza actualizată: ${phaseRecord.phase} — ${phaseRecord.label} (${phaseRecord.progress}%)`;
}

async function handleUpdateMetadata(
  input: Record<string, string>,
  ctx: ToolContext,
): Promise<string> {
  const ALLOWED_KEYS: Record<string, string> = {
    program_finantare: "programFinantare",
    cod_masura: "codMasura",
    cod_sesiune: "codSesiune",
    cod_nomenclator: "codNomenclator",
    prefix_documente: "prefixDocumente",
    cod_mysmis: "codMysmis",
    tip_proiect: "tipProiect",
    structura_dosar: "structuraDosar",
  };
  const update: any = { updatedAt: new Date() };
  const saved: string[] = [];
  for (const [inputKey, dbKey] of Object.entries(ALLOWED_KEYS)) {
    const val = input[inputKey];
    if (val && typeof val === "string" && val.length <= 500) {
      update[dbKey] = val;
      saved.push(`${inputKey}: ${val}`);
    }
  }
  if (saved.length === 0) return "Nicio metadată validă de salvat.";
  await db.update(projects).set(update).where(and(eq(projects.id, ctx.projectId), eq(projects.organizationId, ctx.organizationId)));
  return `Metadate proiect actualizate: ${saved.join(", ")}`;
}

async function handleUpdateChecklist(
  input: { document: string; category?: string; reference?: string; notes?: string },
  ctx: ToolContext,
): Promise<string> {
  if (!input.document || input.document.length > 500) return "Eroare: numele documentului lipsește sau e prea lung.";
  const existing = await db.query.projectChecklist.findFirst({
    where: and(eq(projectChecklist.projectId, ctx.projectId), eq(projectChecklist.name, input.document)),
  });
  if (existing) return `Document deja în checklist: ${input.document}`;
  await db.insert(projectChecklist).values({
    projectId: ctx.projectId,
    name: input.document.slice(0, 500),
    category: input.category || "obligatoriu_depunere",
    source: "solomon",
    notes: [input.reference, input.notes].filter(Boolean).join(" · ").slice(0, 1000) || null,
  });
  return `✅ Adăugat la checklist: ${input.document} (${input.category || "obligatoriu_depunere"})`;
}

// ═══════════════════════════════════════════
// ROUTER — execute the correct tool
// ═══════════════════════════════════════════

export async function executeSolomonTool(
  toolName: string,
  toolInput: any,
  context: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "search_documents":
    case "search_knowledge": // backward compat
      return handleSearchDocuments(toolInput, context);
    case "get_session_documents":
      return handleGetSessionDocuments(context);
    case "save_element":
      return handleSaveElement(toolInput, context);
    case "check_eligibility":
      return handleCheckEligibility(toolInput, context);
    case "estimate_score":
      return handleEstimateScore(toolInput, context);
    case "compose_section":
      return handleComposeSection(toolInput, context);
    case "update_phase":
      return handleUpdatePhase(toolInput, context);
    case "update_metadata":
      return handleUpdateMetadata(toolInput, context);
    case "update_checklist":
      return handleUpdateChecklist(toolInput, context);
    default:
      return `Tool necunoscut: ${toolName}`;
  }
}
