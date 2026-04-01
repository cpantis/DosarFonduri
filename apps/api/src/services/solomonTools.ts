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
import Anthropic from "@anthropic-ai/sdk";
import { searchChapters, getSessionBriefs } from "./chapterSearch";
import { hybridSearch } from "./hybridSearch";
import { db } from "../db";
import { documents, projectElements, elementDefinitions, solomonEligibility, solomonScoring, projects, projectChecklist, companies, rules, guideReferenceTables, budgetItems } from "../db/schema";
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
    name: "compose_chapter" as const,
    description: "Generează textul unui capitol dintr-un document de proiect (memoriu, plan afaceri, cerere finanțare). Returnează textul capitolului care va fi afișat consultantului în chat pentru revizie. Folosește când consultantul cere redactarea unui capitol specific.",
    input_schema: {
      type: "object" as const,
      properties: {
        document_type: {
          type: "string" as const,
          description: "Tipul documentului (ex: 'memoriu_justificativ', 'plan_afaceri', 'cerere_finantare', 'studiu_fezabilitate', 'deviz_hg907')",
        },
        chapter_title: {
          type: "string" as const,
          description: "Titlul capitolului (ex: 'Context și justificare', 'Obiective SMART', 'Metodologie', 'Sustenabilitate')",
        },
        chapter_index: {
          type: "integer" as const,
          description: "Numărul capitolului în document (1, 2, 3...)",
        },
        instructions: {
          type: "string" as const,
          description: "Instrucțiuni specifice de la consultant pentru acest capitol",
        },
        max_words: {
          type: "integer" as const,
          description: "Număr maxim de cuvinte (default 500)",
        },
        previous_chapter_summary: {
          type: "string" as const,
          description: "Rezumat scurt al capitolului anterior (pentru coerență narativă)",
        },
      },
      required: ["document_type" as const, "chapter_title" as const],
    },
  },
  {
    name: "list_document_structure" as const,
    description: "Prezintă structura unui document de proiect pe capitole. Folosește când consultantul cere să genereze un document — arată mai întâi ce capitole va conține.",
    input_schema: {
      type: "object" as const,
      properties: {
        document_type: {
          type: "string" as const,
          description: "Tipul documentului (memoriu_justificativ, plan_afaceri, cerere_finantare, studiu_fezabilitate, deviz_hg907)",
        },
      },
      required: ["document_type" as const],
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
  let chunkResults: Array<{ content: string; metadata?: Record<string, unknown> }> = [];
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
    const meta = (r.metadata || {}) as Record<string, unknown>;
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

// ═══════════════════════════════════════════
// COMPOSE: Chapter-based document generation
// Solomon generates chapters in chat, consultant reviews/edits inline
// ═══════════════════════════════════════════

/** Standard document structures by type */
const DOCUMENT_STRUCTURES: Record<string, Array<{ index: number; title: string; description: string; isCalculation?: boolean }>> = {
  memoriu_justificativ: [
    { index: 1, title: "Date generale ale solicitantului", description: "Denumire, CUI, CAEN, sediu, forma juridică, reprezentant legal" },
    { index: 2, title: "Descrierea activității curente", description: "Obiect activitate, istoric, resurse existente, piața" },
    { index: 3, title: "Context și justificarea investiției", description: "Problema identificată, nevoia de investiție, aliniere cu obiectivele programului" },
    { index: 4, title: "Obiectivele proiectului", description: "Obiectiv general + obiective specifice SMART" },
    { index: 5, title: "Descrierea investiției", description: "Ce se achiziționează/construiește, specificații tehnice, dimensionare" },
    { index: 6, title: "Fundamentarea bugetului", description: "Justificare cheltuieli, metodologie stabilire prețuri, oferte comparative" },
    { index: 7, title: "Metodologie și calendar", description: "Etape implementare, activități, termene, responsabilități" },
    { index: 8, title: "Capacitatea financiară", description: "Surse finanțare, cofinanțare, cash-flow, proiecții financiare" },
    { index: 9, title: "Sustenabilitatea proiectului", description: "Menținere investiție, locuri de muncă, indicatori post-implementare" },
    { index: 10, title: "Impact și rezultate așteptate", description: "Indicatori realizare/rezultat, impact economic, social, de mediu" },
  ],
  plan_afaceri: [
    { index: 1, title: "Rezumat executiv", description: "Sinteza proiectului (max 2 pagini)" },
    { index: 2, title: "Descrierea afacerii", description: "Istoric, experiență, piața, competiție" },
    { index: 3, title: "Produse/Servicii", description: "Ce oferă, diferențiatori, avantaje competitive" },
    { index: 4, title: "Analiza pieței", description: "Piața țintă, segmente, tendințe, concurență" },
    { index: 5, title: "Strategia de marketing", description: "Produs, preț, distribuție, promovare" },
    { index: 6, title: "Planul operațional", description: "Procese, resurse, tehnologii, flux producție" },
    { index: 7, title: "Managementul și organizarea", description: "Echipa, organigrama, responsabilități" },
    { index: 8, title: "Proiecții financiare", description: "Venituri, cheltuieli, profit, cash-flow pe 3-5 ani" },
    { index: 9, title: "Analiza riscurilor", description: "Riscuri identificate, măsuri de mitigare" },
    { index: 10, title: "Concluzii", description: "Viabilitatea investiției, impact așteptat" },
  ],
  cerere_finantare: [
    { index: 1, title: "Date solicitant", description: "Identificare firmă, reprezentant legal, date contact" },
    { index: 2, title: "Date proiect", description: "Titlu, localizare, durată, valoare, intensitate sprijin" },
    { index: 3, title: "Descrierea proiectului", description: "Obiective, activități, rezultate așteptate" },
    { index: 4, title: "Bugetul proiectului", description: "Categorii cheltuieli, valori, eligibilitate", isCalculation: true },
    { index: 5, title: "Surse de finanțare", description: "Grant, cofinanțare, credit", isCalculation: true },
    { index: 6, title: "Indicatori", description: "Indicatori de realizare și de rezultat" },
  ],
  studiu_fezabilitate: [
    { index: 1, title: "Informații generale", description: "Solicitant, amplasament, tema proiect" },
    { index: 2, title: "Descrierea investiției", description: "Situația existentă, necesitatea investiției" },
    { index: 3, title: "Date tehnice ale investiției", description: "Zona, suprafețe, capacități, utilități" },
    { index: 4, title: "Durata de realizare și etapele", description: "Calendar execuție, grafic Gantt" },
    { index: 5, title: "Costurile estimative", description: "Deviz general, pe obiecte, surse finanțare", isCalculation: true },
    { index: 6, title: "Analiza cost-beneficiu", description: "VAN, RIR, termen recuperare", isCalculation: true },
    { index: 7, title: "Sursele de finanțare", description: "Fonduri proprii, credit, grant" },
  ],
  deviz_hg907: [
    { index: 1, title: "Deviz general", description: "Capitolele 1-6 conform HG 907/2016", isCalculation: true },
    { index: 2, title: "Deviz pe obiecte", description: "Detaliere pe categorii de lucrări", isCalculation: true },
    { index: 3, title: "Lista de cantități", description: "Articole, cantități, prețuri unitare", isCalculation: true },
    { index: 4, title: "Grafic de realizare a investiției", description: "Timeline pe luni" },
  ],
};

async function handleComposeChapter(
  input: {
    document_type: string; chapter_title: string; chapter_index?: number;
    instructions?: string; max_words?: number; previous_chapter_summary?: string;
  },
  ctx: ToolContext,
): Promise<string> {
  if (!input.document_type || !input.chapter_title) {
    return "Eroare: tipul documentului și titlul capitolului sunt obligatorii.";
  }
  const docType = input.document_type.slice(0, 100);
  const chapterTitle = input.chapter_title.slice(0, 300);
  const instructions = (input.instructions || "").slice(0, 5000);
  const maxWords = Math.min(input.max_words || 600, 2000);
  const prevSummary = (input.previous_chapter_summary || "").slice(0, 1000);

  // Check if this is a calculation chapter (deterministic, not AI)
  const structure = DOCUMENT_STRUCTURES[docType];
  const chapterDef = structure?.find(ch => ch.title === chapterTitle || ch.index === input.chapter_index);
  if (chapterDef?.isCalculation) {
    // For budget/calculation chapters, build a deterministic table from budget items
    const items = await db.query.budgetItems.findMany({
      where: eq(budgetItems.projectId, ctx.projectId),
    });
    if (items.length > 0) {
      const total = items.reduce((s, i) => s + parseFloat(String(i.totalCost || 0)), 0);
      const eligible = items.filter(i => i.eligible).reduce((s, i) => s + parseFloat(String(i.totalCost || 0)), 0);
      let table = `## ${chapterTitle}\n\n`;
      table += `| Nr. | Categorie | Descriere | Cant. | Preț unitar | Total |\n`;
      table += `|-----|-----------|-----------|-------|-------------|-------|\n`;
      items.forEach((item, idx) => {
        table += `| ${idx + 1} | ${item.category} | ${item.description} | ${item.quantity} | ${Number(item.unitCost).toLocaleString("ro-RO")} | ${Number(item.totalCost).toLocaleString("ro-RO")} |\n`;
      });
      table += `\n**Total investiție:** ${total.toLocaleString("ro-RO")} ${items[0]?.currency || "EUR"}\n`;
      table += `**Total eligibil:** ${eligible.toLocaleString("ro-RO")} ${items[0]?.currency || "EUR"}\n`;
      if (items.some(i => i.exceedsCeiling)) {
        table += `\n⚠️ **Atenție:** Unele articole depășesc plafonul din ghid.\n`;
      }
      return table;
    }
    return `⚙️ **${chapterTitle}** — Capitol cu calcule deterministe.\n\nNu există linii de buget definite pentru acest proiect. Adăugați liniile de buget (categorie, descriere, cantitate, preț unitar) pentru a genera tabelul automat.\n\nFolosiți save_element pentru: valoare_totala_investitie, cota_tva, intensitate_sprijin, contributie_proprie.`;
  }

  // ═══════════════════════════════════════════
  // GATHER FULL PROJECT CONTEXT
  // ═══════════════════════════════════════════

  // 1. Company data
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, ctx.projectId), eq(projects.organizationId, ctx.organizationId)),
  });
  let companyData = "";
  if (project?.companyId) {
    const company = await db.query.companies.findFirst({ where: eq(companies.id, project.companyId) });
    if (company) {
      companyData = `FIRMA: ${company.denumire} (CUI: ${company.cui})
Forma juridică: ${company.formaJuridica || "-"} | CAEN: ${company.caen || "-"}
Adresă: ${company.adresa || "-"}, Jud. ${company.judet || "-"}
An înființare: ${company.anInfiintare || "-"} | Status: ${company.stare || "-"}
Capital social: ${company.capitalSocial || "-"} RON`;
    }
  }

  // 2. Project elements (with keys and labels)
  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, ctx.projectId),
  });
  const elemDefs = await db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, ctx.organizationId),
  });
  const defMap = new Map(elemDefs.map(d => [d.id, d]));

  const elementLines = projectEls
    .filter(e => e.value && e.value.trim() !== "")
    .map(e => {
      const def = e.elementDefId ? defMap.get(e.elementDefId) : null;
      const label = def?.displayName || def?.elementKey || "element";
      return `- **${label}**: ${e.value} ${e.confirmed ? "[confirmat]" : "[propus]"}`;
    })
    .slice(0, 60);

  // 3. Guide rules relevant to this chapter
  const guideRules = await db.query.rules.findMany({
    where: eq(rules.organizationId, ctx.organizationId),
    limit: 30,
  });
  const relevantRules = guideRules
    .filter(r => {
      const desc = (r.description || "").toLowerCase();
      const titleLower = chapterTitle.toLowerCase();
      return desc.includes(titleLower.slice(0, 15)) || titleLower.includes((r.category || "").toLowerCase());
    })
    .slice(0, 10);
  const rulesText = relevantRules.length > 0
    ? relevantRules.map(r => `- [${r.type}] ${r.description?.slice(0, 200)}`).join("\n")
    : "";

  // 4. Eligibility conclusions (from Solomon analysis)
  const eligConclusions = await db.query.solomonEligibility.findMany({
    where: eq(solomonEligibility.projectId, ctx.projectId),
  });
  const eligText = eligConclusions.length > 0
    ? eligConclusions.map(e => `${e.status === "pass" ? "✅" : e.status === "fail" ? "❌" : "⏳"} ${e.ruleName}: ${e.evidence || ""}`).join("\n")
    : "";

  // 5. Document context from guide chapters
  const guideContext = await searchChapters({
    query: chapterTitle + " " + docType.replace(/_/g, " "),
    organizationId: ctx.organizationId,
    folderId: ctx.sessionId || undefined,
    topK: 10,
  });
  const contextText = guideContext
    .map(c => `[${c.documentName}, §${c.title}, pag.${c.pageStart || "?"}]\n${c.content.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  // 6. Budget items (for financial chapters)
  let budgetContext = "";
  const budgetItemsList = await db.query.budgetItems.findMany({
    where: eq(budgetItems.projectId, ctx.projectId),
  });
  if (budgetItemsList.length > 0) {
    const total = budgetItemsList.reduce((s, i) => s + parseFloat(String(i.totalCost || 0)), 0);
    budgetContext = `BUGET PROIECT (${budgetItemsList.length} linii, total: ${total.toLocaleString("ro-RO")} ${budgetItemsList[0]?.currency || "EUR"}):\n` +
      budgetItemsList.slice(0, 20).map(i => `- ${i.category}: ${i.description} — ${Number(i.totalCost).toLocaleString("ro-RO")} ${i.currency}`).join("\n");
  }

  // ═══════════════════════════════════════════
  // AI GENERATION WITH FULL CONTEXT
  // ═══════════════════════════════════════════

  let response: Anthropic.Message;
  try {
    response = await withAILimit(async () => {
      return anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxWords * 5,
        system: `Ești un consultant senior cu 15+ ani experiență în fonduri europene. Scrii capitole pentru dosare de finanțare.

IDENTITATE: Scrii ca un consultant care a câștigat sute de dosare. Evaluatorii detectează textele superficiale.

REGULI NON-NEGOCIABILE:
- Persoana a III-a: "Solicitantul", "SC ${ctx.companyName || "..."}", "Societatea"
- Voce activă: "Societatea va achiziționa" NU "Vor fi achiziționate"
- Fraze 25-45 cuvinte: CONTEXT → ACȚIUNE → REZULTAT CUANTIFICAT
- Fiecare paragraf = O idee + date concrete din dosarul proiectului
- Conectori: "astfel", "în consecință", "prin urmare", "totodată", "de asemenea"
- INTERZIS: superlative goale ("cel mai bun"), formulări vagi ("va îmbunătăți semnificativ")
- OBLIGATORIU: cifre concrete, procente, referințe la ghid, terminologie oficială
- Terminologie: "implementare" (nu "realizare"), "solicitant/beneficiar" (nu "firma"), "valoare eligibilă" (nu "cost"), "contribuție proprie" (nu "bani proprii"), "achiziție" (nu "cumpărare")
- Referință la ghid: "Conform Ghidului solicitantului, secțiunea X..."
- Cuantificare: "creștere cu 40% față de ${new Date().getFullYear() - 1}" NU "creștere semnificativă"
- Dacă nu ai date pentru o valoare, pune [DE COMPLETAT: ...] — NU inventa cifre

RETURNEAZĂ DOAR textul capitolului. Fără preambul, fără explicații, fără "Iată capitolul:".`,
        messages: [{
          role: "user",
          content: `Scrie capitolul "${chapterTitle}" (${chapterDef?.description || ""}) din documentul ${docType.replace(/_/g, " ")} pentru proiectul "${ctx.projectName || ""}".

═══ DATE FIRMĂ ═══
${companyData || "Date firmă indisponibile"}

═══ ELEMENTE PROIECT (${elementLines.length} completate) ═══
${elementLines.join("\n") || "Niciun element completat"}

═══ REGULI RELEVANTE DIN GHID ═══
${rulesText || "Nu au fost extrase reguli specifice din ghid pentru acest capitol"}

═══ CONCLUZII ELIGIBILITATE ═══
${eligText || "Eligibilitatea nu a fost verificată încă"}

${budgetContext ? `═══ BUGET PROIECT ═══\n${budgetContext}\n` : ""}═══ CONTEXT DIN DOCUMENTE SESIUNE ═══
${contextText.slice(0, 20000) || "Nu există documente procesate în sesiune"}

${instructions ? `═══ INSTRUCȚIUNI CONSULTANT ═══\n${instructions}\n` : ""}${prevSummary ? `═══ CAPITOLUL ANTERIOR (REZUMAT) ═══\n${prevSummary}\n` : ""}
Scrie max ${maxWords} cuvinte. Folosește DATELE REALE ale proiectului, nu exemple generice.`,
        }],
      });
    }, "batch");
  } catch (err) {
    console.error("[compose_chapter] AI call failed:", (err as Error).message);
    return `Eroare la generarea capitolului "${chapterTitle}": ${(err as Error).message?.slice(0, 100)}`;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const chapterText = textBlock?.text || "";

  await logAIUsage({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    agent: "solomon",
    model: "claude-sonnet-4-6",
    tokensInput: response.usage?.input_tokens || 0,
    tokensOutput: response.usage?.output_tokens || 0,
    action: `compose_${chapterTitle.slice(0, 30)}`,
  });

  return chapterText;
}

async function handleListDocumentStructure(
  input: { document_type: string },
  _ctx: ToolContext,
): Promise<string> {
  const docType = (input.document_type || "").trim();
  const structure = DOCUMENT_STRUCTURES[docType];

  if (!structure) {
    const available = Object.keys(DOCUMENT_STRUCTURES).map(k => `- ${k.replace(/_/g, " ")}`).join("\n");
    return `Tip document necunoscut: "${docType}".\n\nDocumente disponibile:\n${available}`;
  }

  const lines = structure.map(ch => {
    const calcTag = ch.isCalculation ? " ⚙️ [CALCUL DETERMINIST]" : "";
    return `**${ch.index}. ${ch.title}**${calcTag}\n   ${ch.description}`;
  });

  return `📋 **Structura: ${docType.replace(/_/g, " ").toUpperCase()}**\n\n${lines.join("\n\n")}\n\n---\nPentru a genera un capitol, spuneți-mi care capitol doriți (ex: "Generează capitolul 3").`;
}

async function handleUpdatePhase(
  input: { phase: string; label: string; progress: number; next_action?: string; regression_from?: string; regression_reason?: string },
  ctx: ToolContext,
): Promise<string> {
  const phaseRecord: Record<string, unknown> = {
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
    .set({ solomonPhase: phaseRecord as any })
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
  const update: Record<string, unknown> = { updatedAt: new Date() };
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
    case "compose_chapter":
    case "compose_section": // backward compat
      return handleComposeChapter(toolInput, context);
    case "list_document_structure":
      return handleListDocumentStructure(toolInput, context);
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
