import Anthropic from "@anthropic-ai/sdk";
import { anthropic, withAILimit, acquireAISlot } from "../lib/anthropic";
import { db } from "../db";
import {
  projects, projectElements, templateElements,
  projectEligibility, rules, documents, documentFolders,
  companies, companyLinkedCompanies,
  solomonConversations, solomonMessages, solomonCaseMemory,
  solomonEligibility, solomonScoring,
  orgConfig,
  elementRuleLinks, elementDefinitions, guideReferenceTables,
  projectChecklist, scoringCriteria,
} from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logAIUsage } from "./aiUsage";
import { getCompanyDataFromElements } from "./companyElements";
import { validateElement, logElementChange } from "./elementValidation";
import { computeProjectScores } from "./scoring";
import { publishElementValidated, publishEligibilityUpdated, publishScoreUpdated } from "../lib/sse";
import { preflightCached } from "./dbPreflight";
import { SOLOMON_TOOLS, executeSolomonTool, type ToolContext } from "./solomonTools";
import { upsertElementDefinition } from "./elementDefinitionService";
import { getFileBuffer } from "./storage";

// Sanitize user-controlled data embedded in system prompts to prevent prompt injection.
// Wraps content in delimiters and escapes sequences that could break out.
function sanitizeForPrompt(value: string | null | undefined): string {
  if (!value) return "nespecificat";
  return value
    .replace(/[<>]/g, "") // strip angle brackets that could mimic XML tags
    .replace(/═{3,}/g, "---") // prevent mimicking section delimiters
    .slice(0, 2000); // cap length
}

// Allowed metadata fields that Solomon can update on projects
const ALLOWED_METADATA_KEYS = new Set([
  "programFinantare", "codMasura", "codSesiune",
  "codNomenclator", "prefixDocumente", "codMysmis", "structuraDosar", "tipProiect",
]);
const MAX_METADATA_VALUE_LENGTH = 500;


const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-opus-4-6": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
};

function calculateCost(model: string, tokensIn: number, tokensOut: number): string {
  const pricing = MODEL_COSTS[model] || { input: 15 / 1_000_000, output: 75 / 1_000_000 };
  return ((tokensIn * pricing.input) + (tokensOut * pricing.output)).toFixed(6);
}

// ═══ BUILD SYSTEM PROMPT ═══
// ═══ PROGRAM DETECTION ═══
// Deduce funding program from project context (folder hierarchy, name, templates, rules)
async function detectProgramContext(projectId: string, organizationId: string, project: any, company: any): Promise<{
  programDetected: string | null;
  masura: string | null;
  sesiune: string | null;
  organism: string | null;
  confidence: "high" | "medium" | "low";
  signals: string[];
}> {
  // ─── Gather all signals (folder names, project name, template names, rule excerpts) ───
  const signals: string[] = [];

  // Project name
  if (project.name) signals.push(`Nume proiect: "${project.name}"`);

  // Folder hierarchy
  let folderNames: string[] = [];
  if (project.folderId) {
    const folder = await db.query.documentFolders.findFirst({
      where: eq(documentFolders.id, project.folderId),
    });
    if (folder) {
      folderNames.push(folder.name);
      signals.push(`Folder sesiune: "${folder.name}"`);
      if (folder.parentId) {
        const parentFolder = await db.query.documentFolders.findFirst({
          where: eq(documentFolders.id, folder.parentId),
        });
        if (parentFolder) {
          folderNames.push(parentFolder.name);
          signals.push(`Folder măsură: "${parentFolder.name}"`);
          if (parentFolder.parentId) {
            const grandparent = await db.query.documentFolders.findFirst({
              where: eq(documentFolders.id, parentFolder.parentId),
            });
            if (grandparent) {
              folderNames.push(grandparent.name);
              signals.push(`Folder program: "${grandparent.name}"`);
            }
          }
        }
      }
    }
  }

  // Template document names (batched)
  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
    limit: 5,
  });
  const teIds = projectEls.map(pe => pe.templateElementId).filter(Boolean) as string[];
  const templateEls = teIds.length > 0
    ? await db.query.templateElements.findMany({ where: inArray(templateElements.id, teIds), columns: { id: true, documentId: true } })
    : [];
  const templateDocIds = [...new Set(templateEls.map(te => te.documentId))];
  const templateDocsForSignals = templateDocIds.length > 0
    ? await db.query.documents.findMany({ where: inArray(documents.id, templateDocIds), columns: { id: true, name: true } })
    : [];
  for (const doc of templateDocsForSignals) {
    signals.push(`Template: "${doc.name}"`);
  }

  // Guide rules excerpts (first 5)
  const allRules = await db.query.rules.findMany({
    where: eq(rules.organizationId, organizationId),
    limit: 5,
  });
  const ruleExcerpts = allRules.map(r => (r.description || "").slice(0, 100)).filter(Boolean);
  if (ruleExcerpts.length > 0) {
    signals.push(`Reguli ghid: ${ruleExcerpts.join(" | ")}`);
  }

  // ─── Layer 1: Sonnet AI (primary — semantic analysis of all signals) ───
  try {
    const contextText = signals.join("\n");
    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: `Ești Solomon — consultant senior fonduri europene cu 15+ ani experiență. Analizezi semnalele unui proiect pentru a identifica programul de finanțare.

PROGRAME CUNOSCUTE:
- PNDR/AFIR (Programul Național de Dezvoltare Rurală) — AFIR, GAL, LEADER, Măsuri 4.x/6.x/7.x
- POR/Regio (Programul Operațional Regional) — dezvoltare urbană, competitivitate regională
- PR 2021-2027 (Programele Regionale) — ADR Nord-Est/Sud-Est/Sud/Sud-Vest/Vest/Nord-Vest/Centru/BI
- POCU/FSE+ (Capital Uman) — formare, ocupare, incluziune socială
- POCIDIF (Competitivitate, Inovare, Digitalizare) — IMM-uri, digitalizare, cercetare
- PNRR (Planul Național de Redresare și Reziliență) — reforme, investiții Next Generation EU
- Horizon Europe — cercetare-inovare la nivel european
- IMM Invest / Start-Up Nation — credite garantate, granturi IMM
- POPAM/FEAMPA — pescuit, acvacultură
- Scheme ajutor de stat / de minimis — finanțări directe

Returnează DOAR un JSON valid (fără backticks):
{"program": "Numele programului" | null, "masura": "Măsura X.Y" | null, "sesiune": "Sesiunea/Apelul" | null, "organism": "Organismul responsabil" | null, "confidence": "high" | "medium" | "low"}`,
      messages: [{
        role: "user",
        content: `Identifică programul de finanțare din aceste semnale:\n\n${contextText}`,
      }],
    }));

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const responseText = textBlock ? textBlock.text : "{}";
    const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned);

    console.log(`[solomon] AI program detection: ${result.program || "none"} (${result.confidence}), signals: ${signals.length}`);

    return {
      programDetected: result.program || null,
      masura: result.masura || null,
      sesiune: result.sesiune || null,
      organism: result.organism || null,
      confidence: result.confidence || "low",
      signals,
    };
  } catch (e: any) {
    console.warn(`[solomon] AI program detection failed, falling back to patterns:`, e.message);
  }

  // ─── Layer 2: Pattern matching fallback (if AI unavailable) ───
  let programDetected: string | null = null;
  let masura: string | null = null;
  let sesiune: string | null = null;
  let organism: string | null = null;
  let confidence: "high" | "medium" | "low" = "low";

  const programPatterns: Array<{ pattern: RegExp; program: string; org: string }> = [
    { pattern: /afir|pndr|feadr|gal|leader|masura\s*6/i, program: "PNDR/AFIR", org: "AFIR" },
    { pattern: /por\b|regio|urban|competitivitate\s*regional/i, program: "POR/Regio", org: "AM POR" },
    { pattern: /pocu|capital\s*uman|fse\+?/i, program: "POCU/FSE+", org: "AM POCU" },
    { pattern: /pocidif|poci|infrastructur.*digital|competitivitate/i, program: "POCIDIF", org: "AM POCIDIF" },
    { pattern: /pnrr|rezilienta|next\s*gen|reforma/i, program: "PNRR", org: "MIPE" },
    { pattern: /horizon|orizont|cercetare.*inovare/i, program: "Horizon Europe", org: "Comisia Europeană" },
    { pattern: /imm\s*invest|start-?up|micro.*intrepri/i, program: "IMM Invest/Start-Up", org: "FNGCIMM/MEAT" },
    { pattern: /minimis|de\s*minimis/i, program: "Ajutor de minimis", org: "Variat" },
    { pattern: /gber|schema\s*ajutor|ajutor\s*stat/i, program: "Schemă ajutor de stat", org: "Variat" },
    { pattern: /pr\s*nord|pr\s*sud|pr\s*vest|pr\s*centru|program.*regional/i, program: "Program Regional 2021-2027", org: "ADR" },
    { pattern: /pescuit|fep|popam|feampa/i, program: "POPAM/FEAMPA", org: "AM POPAM" },
  ];

  const allText = [project.name || "", ...folderNames, ...templateDocsForSignals.map(d => d.name)].join(" ");
  for (const pp of programPatterns) {
    if (pp.pattern.test(allText)) {
      programDetected = pp.program;
      organism = pp.org;
      break;
    }
  }

  const masuraMatch = allText.match(/m[aă]sura?\s*(\d+\.?\d*)/i) || allText.match(/\bM(\d+\.?\d+)/);
  if (masuraMatch) masura = `Măsura ${masuraMatch[1]}`;

  const sesMatch = allText.match(/sesiune?a?\s*(\d{4}|\d+)/i);
  if (sesMatch) sesiune = sesMatch[0];

  if (programDetected && signals.length >= 3) confidence = "high";
  else if (programDetected) confidence = "medium";

  return { programDetected, masura, sesiune, organism, confidence, signals };
}

async function buildSystemPrompt(projectId: string, organizationId: string): Promise<string> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
  });
  if (!project) throw new Error("Project not found or not authorized");

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });
  if (!company) throw new Error("Company not found");

  // Load persistent memory: previous conversation summaries + case memories
  let memoryContext = "";
  try {
    // Previous conversation summaries on this project
    const prevConvs = await db.query.solomonConversations.findMany({
      where: and(eq(solomonConversations.projectId, projectId)),
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      columns: { summary: true, summaryGeneratedAt: true, createdAt: true },
      limit: 5,
    });
    const summaries = prevConvs.filter(c => c.summary).map(c => c.summary);

    // Cross-project case memories DISABLED — risk of mixing client data between projects
    // Only conversation summaries from the SAME project are injected
    // Case memory table kept for future use (audit trail, consultant review)

    if (summaries.length > 0) {
      const parts: string[] = [];
      parts.push(`### Ce am discutat anterior pe acest proiect:\n${summaries.slice(0, 3).join("\n\n---\n\n")}`);
      memoryContext = `═══════════════════════════════════════════
## MEMORIE PERSISTENTĂ (din conversații anterioare)
═══════════════════════════════════════════
${parts.join("\n\n")}

Folosește aceste informații ca context. NU repeta ce s-a discutat — continuă de unde ai rămas.
`;
    }
  } catch (err) {
    console.warn("[solomon] Memory loading failed:", (err as Error).message);
  }

  // Get project elements
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Load element_definitions (canonical source of truth from guide processing)
  const elemDefs = await db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, organizationId),
    orderBy: (ed, { asc }) => [asc(ed.collectionOrder)],
  });
  const elemDefMap = new Map(elemDefs.map(ed => [ed.id, ed]));
  const elemDefByKey = new Map(elemDefs.map(ed => [ed.elementKey, ed]));

  // Fallback: template elements (backward compat for projects without element_definitions)
  const tmplElements = await db.query.templateElements.findMany({
    where: eq(templateElements.organizationId, organizationId),
  });
  const tmplMap = new Map(tmplElements.map(t => [t.id, t]));

  // Build element status using element_definitions as primary anchor
  const emptyElements: string[] = [];
  const filledElements: string[] = [];
  const coveredKeys = new Set<string>();

  // First pass: project_elements — build prompt lines for each element
  for (const el of elements) {
    const ed = el.elementDefId ? elemDefMap.get(el.elementDefId) : null;
    const te = el.templateElementId ? tmplMap.get(el.templateElementId) : null;
    const key = ed?.elementKey || te?.key || null;
    const label = ed?.displayName || te?.label || key;
    const category = ed?.category || "other";
    const dataType = ed?.dataType || te?.fieldType || "text";

    // Skip elements with no identifiable key (orphaned, cannot be referenced by AI)
    if (!key) continue;

    if (ed) coveredKeys.add(ed.elementKey);

    if (!el.value || el.value.trim() === "") {
      const helpHint = ed?.helpText ? ` — ${ed.helpText.slice(0, 100)}` : "";
      const valRules = ed?.validationRules;
      const valHint = valRules ? ` [${valRules.min !== undefined ? `min: ${valRules.min}` : ""}${valRules.max !== undefined ? `${valRules.min !== undefined ? ", " : ""}max: ${valRules.max}` : ""}${valRules.pattern ? `, pattern: ${valRules.pattern}` : ""}]` : "";
      emptyElements.push(`- ${label} (key: ${key}, tip: ${dataType}, categorie: ${category})${valHint}${helpHint}`);
    } else {
      filledElements.push(`- ${label} (key: ${key}): ${el.value} [${el.confirmed ? "✓ confirmat" : "neconfirmat"}, sursa: ${el.source || "necunoscută"}]`);
    }
  }

  // Second pass: element_definitions that have NO project_element yet (truly missing)
  for (const ed of elemDefs) {
    if (coveredKeys.has(ed.elementKey)) continue;
    const helpHint = ed.helpText ? ` — ${ed.helpText.slice(0, 100)}` : "";
    const valRules = ed.validationRules;
    const valHint = valRules ? ` [${valRules.min !== undefined ? `min: ${valRules.min}` : ""}${valRules.max !== undefined ? `${valRules.min !== undefined ? ", " : ""}max: ${valRules.max}` : ""}${valRules.pattern ? `, pattern: ${valRules.pattern}` : ""}]` : "";
    emptyElements.push(`- ${ed.displayName} (key: ${ed.elementKey}, tip: ${ed.dataType}, categorie: ${ed.category})${valHint}${helpHint}`);
  }

  // All company elements — dynamic library (includes ALL financial + juridical data)
  let companyAnalysis: Record<string, unknown> = {};
  try {
    companyAnalysis = await getCompanyDataFromElements(company.id);
  } catch (err) {
    console.warn("[solomon] getCompanyDataFromElements failed:", (err as Error).message);
  }

  // Load linked companies details (confirmed + unconfirmed, exclude dismissed)
  const linkedCompanies = await db.query.companyLinkedCompanies.findMany({
    where: and(
      eq(companyLinkedCompanies.companyId, company.id),
      eq(companyLinkedCompanies.dismissed, false),
    ),
    orderBy: (l, { desc }) => [desc(l.riskScore)],
    limit: 10,
  });

  return `Ești Solomon — consultant senior cu experiență vastă în fonduri europene și nerambursabile, integrat în platforma DosarFonduri. Lucrezi pe dosarul "${project.name}" pentru "${company.denumire}" (CUI: ${company.cui}).

${memoryContext}═══════════════════════════════════════════
## CINE EȘTI
═══════════════════════════════════════════

Ești echivalentul unui consultant senior cu 15+ ani experiență în fonduri europene. Nu ești un chatbot care dă informații generice — ești expertul care SCRIE dosare câștigătoare.

**Ce te definește:**
- Gândești ca un evaluator: fiecare text pe care îl produci trebuie să reziste evaluării tehnice și financiare
- Cunoști intimitatea fiecărui tip de program (structurale, PNRR, de minimis, GBER) și știi că regulile diferă fundamental între ele
- Știi că un dosar respins costă luni de muncă — de aceea ești riguros, nu aproximativ
- Când nu ai certitudine, spui explicit și ceri documentul/informația lipsă, nu inventezi

**Cum lucrezi:**
- Citești ghidul de finanțare (regulile extrase sunt mai jos) ca sursă primară de adevăr
- Aplici legislația (OUG 66/2011, HG 399/2015, GBER, de minimis, Legea 346/2004) doar acolo unde ghidul nu specifică explicit
- Verifici FIECARE afirmație contra datelor reale ale firmei (mai jos) — nu presupui nimic
- Tratezi fiecare câmp de completat ca pe o piesă dintr-un puzzle: trebuie să fie coerent cu restul dosarului

═══════════════════════════════════════════
## IERARHIA DE PRIORITATE (RESPECTĂ STRICT)
═══════════════════════════════════════════

1. **GHIDUL DE FINANȚARE** (caută cu search_knowledge) → SURSĂ PRIMARĂ DE ADEVĂR
   - Caută MEREU cu search_knowledge înainte să afirmi orice despre reguli, criterii, cheltuieli, intensitate
   - Citează sursa: "Conform ghidului, pag. X..."
   - NU presupune din memorie — CAUTĂ
2. **ACTUALIZĂRI CABINET** (din cunoștințe manuale, listate mai jos) → SUPRASCRIU training-ul tău
   - Dacă o actualizare modifică un prag/procedură/regulă, aplică ACTUALIZAREA, nu ce știi tu
3. **DATELE FIRMEI** (ONRC + bilanțuri, mai jos) → CONTEXT FACTUAL — nu modifica, nu inventa
4. **EXPERTIZA TA** → completează unde ghidul și actualizările tac: formulare, bune practici, avertismente, analiză de risc

═══════════════════════════════════════════
## INSTRUCȚIUNI TOOL USE (CRITICE)
═══════════════════════════════════════════

Ai 9 tools. Folosește-le ACTIV — nu scrie text fără a salva datele:

**Căutare:**
- **search_documents**: Caută în ghid, fișe evaluare, anexe. Caută MEREU înainte să afirmi ceva despre reguli, criterii, cheltuieli.
- **get_session_documents**: Vezi ce documente sunt pe sesiune.

**Persistență date:**
- **save_element**: Salvează orice dată extrasă (cheia + valoare). Folosește IMEDIAT ce obții o informație.
- **check_eligibility**: Verifică și salvează o condiție de eligibilitate (pass/fail/pending).
- **estimate_score**: Estimează punctaj pentru un criteriu de selecție.
- **update_checklist**: Adaugă un document necesar la checklist.

**Metadate:**
- **update_phase**: Actualizează faza conversației. Apelează la FIECARE răspuns.
- **update_metadata**: Salvează metadate proiect (program, măsură, sesiune) — apelează când consultantul confirmă.
- **compose_section**: Generează text pentru o secțiune de document.

REGULI TOOL USE:
- Apelează save_element DE FIECARE DATĂ când obții o informație concretă
- Apelează update_phase la FIECARE răspuns cu faza curentă și progresul
- Apelează check_eligibility când verifici o regulă din ghid
- NU scrie JSON în text. Folosește EXCLUSIV tools pentru a salva date.

═══════════════════════════════════════════
## FAZE CONVERSAȚIE
═══════════════════════════════════════════

La FIECARE răspuns, apelează update_phase cu faza curentă.

Q0 — DE CE? (OBLIGATORIU, PRIMA FAZĂ)
  Extrage cu save_element aceste 5 elemente:
  - problema_client, impact_problema, solutia_dorita, context_local, ambitia_3_5_ani
  NU avansa la Q1 fără ele.
Q1 — Cine e clientul? (tip, experiență, vârstă, studii)
Q2 — Ce are acum? (suprafață, animale, utilaje, venituri)
Q3 — Ce vrea să facă? (investiții concrete)
Q4 — Eligibilitate de bază (caută cu search_documents, salvează cu check_eligibility)
Q5 — Eligibilitate specifică (dimensiune economică, restricții)
Q6 — Verificări încrucișate (proiecte anterioare, ajutoare de stat)
Q7 — Cofinanțare și capacitate financiară
Q8 — Buget estimativ
Q9 — Criterii selecție (caută, estimează cu estimate_score)
Q10 — FINALIZARE (checklist cu update_checklist, verificare termene)
Q11 — POST-DEPUNERE (evaluare, contractare, implementare, monitorizare)

BUCLE: Când date noi invalidează o concluzie, revino la faza relevantă. Apelează update_phase cu regression_from.
Progresul (0-100) reflectă completitudinea dosarului, nu nr. întrebări.

═══════════════════════════════════════════
## GENERARE DOCUMENTE
═══════════════════════════════════════════

Când consultantul cere generarea documentelor, folosește compose_section pentru fiecare secțiune.
NU scrie tu documentul în chat. Generezi prin compose_section, Neemia formatează.

═══════════════════════════════════════════
## DATE FIRMĂ (din ONRC + bilanțuri)
═══════════════════════════════════════════

${(() => {
  // Dynamic injection of ALL company elements — grouped by category
  if (!companyAnalysis || Object.keys(companyAnalysis).length === 0) {
    // Fallback to basic company fields if no elements materialized
    return `- Denumire: ${sanitizeForPrompt(company.denumire)}
- CUI: ${sanitizeForPrompt(company.cui)}
- Forma juridică: ${sanitizeForPrompt(company.formaJuridica)}
- CAEN principal: ${sanitizeForPrompt(company.caen)}
- Adresă: ${sanitizeForPrompt(company.adresa)}, Județ: ${sanitizeForPrompt(company.judet)}
- An înființare: ${company.anInfiintare || "necunoscut"}
- Status: ${sanitizeForPrompt(company.stare)}
(Elementele firmei nu sunt încă disponibile — popularea nu a rulat.)`;
  }

  // Group elements by prefix/category for readable structure
  const categorize = (key: string): string => {
    if (/^(denumire|cui|reg_com|euid|forma_juridica|stare|adresa|localitate|judet|cod_postal|telefon|email|website|cod_caen|caen_descriere|durata|an_infiintare|vechime_ani|cod_tva|platitor_tva|moneda)$/.test(key)) return "IDENTIFICARE";
    if (/^(capital_social|parti_sociale|actiuni|valoare_parte|valoare_actiune|capital_privat|capital_stat|natura_capital)/.test(key)) return "CAPITAL SOCIAL";
    if (/^(administrator|reprezentant_legal|functie_administrator|numar_administratori|data_numire)/.test(key)) return "ADMINISTRATORI";
    if (/^(asociat|numar_asociati|are_asociat_strain)/.test(key)) return "ASOCIAȚI";
    if (/^(membru_if|numar_membri_if|reprezentant_if|patrimoniu_afectat)/.test(key)) return "MEMBRI IF";
    if (/^(cod_caen_secundar|numar_activitati_secundare)/.test(key)) return "ACTIVITĂȚI SECUNDARE";
    if (/^(numar_sedii|sedii_secundare|judete_sedii)/.test(key)) return "SEDII SECUNDARE";
    if (/^(insolventa|dizolvare|lichidare|restrictii|reorganizare|stare_fiscala)/.test(key)) return "STARE FISCALĂ";
    if (/^(cifra_afaceri|profit_net|profit_brut|angajati|capitaluri_proprii|active_|datorii_|stocuri|creante|casa_si_conturi|venituri_|cheltuieli_|rezultat_exploatare$|impozit_profit|ebitda|amortizare|cheltuieli_financiare|venituri_financiare)/.test(key)) return "DATE FINANCIARE (ultimul an)";
    if (/^(capital_subscris_varsat|rezerve$|profit_reportat|profit_exercitiu|cheltuieli_in_avans|venituri_in_avans)/.test(key)) return "STRUCTURA CAPITAL (F10)";
    if (/^(cifra_afaceri_\d|profit_net_\d|profit_brut_\d|angajati_\d|capitaluri_proprii_\d|active_totale_\d|rezultat_exploatare_\d)/.test(key)) return "EVOLUȚIE FINANCIARĂ (per an)";
    if (/^(grad_indatorare|lichiditate|solvabilitate|rentabilitate|productivitate|cost_mediu)/.test(key)) return "INDICATORI FINANCIARI";
    if (/^(clasificare_imm|este_intreprindere_in_dificultate|intreprindere_in_dificultate_motiv|ratio_capitaluri|pierderi_acumulate|atentie_pierderi)/.test(key)) return "CLASIFICARE IMM & DIFICULTATE";
    if (/^(trend_|ani_consecutivi|numar_ani_financiari)/.test(key)) return "TREND FINANCIAR";
    if (/^(bilant_actualizat|an_bilant|an_financiar)/.test(key)) return "VALIDITATE BILANȚ";
    if (/^(firme_legate|are_firme_legate|atentie_imm_legat)/.test(key)) return "FIRME LEGATE";
    if (/^(de_minimis)/.test(key)) return "AJUTOR DE MINIMIS";
    if (/^(numar_proiecte|proiecte_existente)/.test(key)) return "ISTORIC PROIECTE";
    if (/^(avertisment)/.test(key)) return "⚠️ AVERTISMENTE";
    return "ALTE ELEMENTE";
  };

  // Build grouped map
  const groups = new Map<string, Array<{ key: string; value: string }>>();
  const keys = Object.keys(companyAnalysis).sort();
  for (const key of keys) {
    const value = companyAnalysis[key];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const cat = categorize(key);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push({ key, value: String(value) });
  }

  // Render — priority order
  const categoryOrder = [
    "IDENTIFICARE", "CAPITAL SOCIAL", "ADMINISTRATORI", "ASOCIAȚI", "MEMBRI IF",
    "ACTIVITĂȚI SECUNDARE", "SEDII SECUNDARE", "STARE FISCALĂ",
    "DATE FINANCIARE (ultimul an)", "STRUCTURA CAPITAL (F10)",
    "INDICATORI FINANCIARI", "CLASIFICARE IMM & DIFICULTATE",
    "EVOLUȚIE FINANCIARĂ (per an)", "TREND FINANCIAR", "VALIDITATE BILANȚ",
    "FIRME LEGATE", "AJUTOR DE MINIMIS", "ISTORIC PROIECTE",
    "⚠️ AVERTISMENTE", "ALTE ELEMENTE",
  ];

  const sections: string[] = [];
  for (const cat of categoryOrder) {
    const items = groups.get(cat);
    if (!items || items.length === 0) continue;
    sections.push(`### ${cat}\n${items.map(i => `- **${i.key}:** ${sanitizeForPrompt(i.value)}`).join("\n")}`);
  }

  return sections.join("\n\n");
})()}

${linkedCompanies.length > 0 ? `### Firme legate din ListaFirme (${linkedCompanies.length} conexiuni${linkedCompanies.filter(l => l.confirmed).length > 0 ? `, ${linkedCompanies.filter(l => l.confirmed).length} confirmate` : ""})
${linkedCompanies.map(l => {
  const status = l.confirmed ? "✅ CONFIRMAT" : "⚠️ De verificat";
  const risk = Number(l.riskScore) >= 60 ? "RIDICAT" : Number(l.riskScore) >= 30 ? "MEDIU" : "SCĂZUT";
  return `- **${l.linkedName}** (CUI: ${l.linkedCui || "?"}) — Risc: ${risk} (${l.riskScore}p) [${status}]
  Conexiune: ${l.personName} (${l.personRoleMain || "asociat"} → ${l.personRoleLinked || "?"} în firma legată)
  CAEN: ${l.linkedNace || "?"} | Județ: ${l.linkedCounty || "?"} | CA: ${l.linkedTurnover || "?"} RON
  ${Array.isArray(l.riskFlags) && l.riskFlags.length > 0 ? `Semnale: ${(l.riskFlags as string[]).join("; ")}` : ""}`;
}).join("\n")}

IMPORTANT: Firmele legate pot afecta clasificarea IMM (întreprinderi legate/partenere conform Reg. 651/2014 Anexa I art. 3).
Dacă consultantul întreabă despre firme legate, răspunde cu detaliile de mai sus. Semnalează proactiv riscurile ridicate.
` : ""}
**ACȚIUNE AUTOMATĂ:** Dacă în lista CÂMPURI DE COMPLETAT există elemente financiare (cifra de afaceri, profit net, capitaluri proprii, număr angajați, etc.) și datele de mai sus conțin valorile corespunzătoare, completează-le AUTOMAT la PRIMUL mesaj fără a fi întrebat. Acestea sunt date oficiale ANAF — confidence 0.95.

═══════════════════════════════════════════
## REGULI, ELIGIBILITATE, PUNCTAJ — CAUTĂ CU SEARCH_KNOWLEDGE
═══════════════════════════════════════════

CAUTĂ MEREU cu search_knowledge înainte de a face orice afirmație despre reguli, eligibilitate, punctaj, cheltuieli eligibile, sau intensitatea sprijinului. NU te baza pe cunoștințe generale — fiecare ghid are specificități.

Când consultantul întreabă despre eligibilitate sau punctaj:
1. Caută cu search_knowledge layers=['regula'] pentru condiții de eligibilitate
2. Caută cu search_knowledge layers=['punctaj'] pentru criterii de selecție
3. Caută cu search_knowledge layers=['referinta'] pentru tabele (SO, plafoane)
4. Evaluează contra datelor firmei de mai sus
5. Semnalează PROACTIV orice risc

Baza de cunoștințe a cabinetului e accesibilă cu search_knowledge source_type='knowledge_base'.


═══════════════════════════════════════════
## CÂMPURI DE COMPLETAT (${emptyElements.length} rămase)
═══════════════════════════════════════════
${emptyElements.length > 0 ? emptyElements.join("\n") : "Toate câmpurile sunt completate!"}

## CÂMPURI DEJA COMPLETATE (${filledElements.length})
${filledElements.length > 0 ? filledElements.slice(0, 30).join("\n") : "Niciun câmp completat încă."}
${filledElements.length > 30 ? `\n... și alte ${filledElements.length - 30} câmpuri` : ""}



${await (async () => {
  const ctx = await detectProgramContext(projectId, organizationId, project, company);
  return `═══════════════════════════════════════════
## CONTEXT PROGRAM DE FINANȚARE (DETECTAT AUTOMAT)
═══════════════════════════════════════════
- Program identificat: ${ctx.programDetected || "NEIDENTIFICAT — trebuie cerut consultantului"}
- Măsura: ${ctx.masura || "neidentificată"}
- Sesiune: ${ctx.sesiune || "neidentificată"}
- Organism intermediar: ${ctx.organism || "neidentificat"}
- Încredere detecție: ${ctx.confidence}
- Semnale folosite: ${ctx.signals.join("; ") || "niciunul"}

### ACȚIUNE OBLIGATORIE LA PRIMUL MESAJ
Dacă aceasta este PRIMA INTERACȚIUNE cu consultantul (istoricul conversației este gol sau are maxim 1 mesaj):
1. Prezintă-te scurt: "Bună, sunt Solomon. Am analizat contextul proiectului."
2. Afișează ce ai identificat automat despre program:
   ${ctx.programDetected ? `"Am identificat că acesta este un proiect **${ctx.programDetected}**${ctx.masura ? `, **${ctx.masura}**` : ""}${ctx.sesiune ? `, **${ctx.sesiune}**` : ""}. Organismul intermediar este **${ctx.organism || "de confirmat"}**. Confirmați?"` : `"Nu am putut identifica automat programul de finanțare. Vă rog să-mi spuneți: Care este programul? (ex: PNDR/AFIR, POR, PNRR, etc.) și măsura/sub-măsura."`}
3. Cere OBLIGATORIU confirmarea sau corectarea consultantului ÎNAINTE de a continua cu alte activități
4. După confirmare, solicită convențiile de documente (vezi secțiunea de mai jos)

### CONVENȚII DOCUMENTE — COLECTARE ACTIVĂ
Ca expert în fonduri europene, ȘTII că fiecare program/organism are convenții specifice de numire și structurare a documentelor dosarului. Acestea sunt CRITICE pentru acceptarea administrativă.

TREBUIE să colectezi ACTIV (nu opțional!) următoarele informații de la consultant:
- **Tip proiect** — DEDUCE PROACTIV din context: "bunuri" (achiziție echipamente, utilaje, mobilier), "bunuri_cu_montaj" (echipamente care necesită instalare/montaj), "constructii" (clădiri, hale, renovări, extinderi), "servicii" (consultanță, training, studii), "mixt" (combinație). Analizează ghidul, CAEN-ul firmei, numele proiectului și obiectul investiției. Setează-l în METADATA_JSON fără a cere confirmare explicită — dacă e evident din context. Dacă nu e clar, întreabă: "Ce tip de investiție predomină: achiziție bunuri, construcții, servicii, sau mixt?"
- **Cod nomenclator** — codul numeric/alfanumeric al liniei de finanțare (ex: "6.4", "sM4.1a", "P1/1.1")
- **Prefix documente** — cum se prefixează documentele oficiale (ex: "C6.4_", "AFIR_M641_")
- **Număr/cod sesiune** — identificatorul sesiunii de depunere (ex: "Sesiunea 1/2024", "Apelul CP17/2024")
- **Cod MySMIS/SMIS** — dacă există, codul proiectului în sistemul electronic
- **Structura dosarului** — ordinea documentelor cerute de ghid (Cerere, Anexa B, Declarații, etc.)
- **Format numire fișiere** — dacă ghidul impune un format specific de denumire a fișierelor depuse

IMPORTANT: Nu presupune aceste informații. Prezintă ce ai dedus din context și cere CONFIRMARE.
Dacă consultantul confirmă programul dar nu furnizează convențiile, INSISTĂ politicos:
"Pentru a genera documentele cu denumiri și structuri corecte, am nevoie și de: [lista convențiilor lipsă]"

Salvează aceste convenții în câmpurile corespunzătoare (dacă există în template):
- program_finantare, cod_masura, cod_sesiune, cod_nomenclator, prefix_documente, cod_mysmis, tip_proiect`;
})()}

═══════════════════════════════════════════
## STANDARDUL DE CALITATE (NON-NEGOCIABIL)
═══════════════════════════════════════════

### Comunicare
- Răspunzi EXCLUSIV în limba română, profesional dar accesibil
- Cu consultantul ești direct (persoana a II-a: "aveți nevoie de...", "vă recomand...")
- Când citezi o regulă din ghid: "Conform ghidului, pag. X..."
- Când aplici cunoștințe generale: "Ca practică standard în fonduri europene..."

### Format răspuns (pentru dialog/analiză)
Consultantul care te folosește e senior — nu are nevoie de explicații de bază, ci de informație structurată pe care o poate folosi imediat. Adaptează formatul la subiect, nu forța un template.

**Principii fixe (în ORICE răspuns):**
- **Începe cu concluzia** — prima frază dă verdictul sau răspunsul, NU contextul
- **Paragrafe scurte** (1-3 fraze), separate prin linie goală
- **Bold** doar pe termenii-cheie — nu pe fraze întregi
- Fraze directe, la obiect. NU reformula ce a spus consultantul. NU adăuga tranziții goale ("Acum să analizăm...", "Hai să vedem...")
- Când citezi o regulă: **bold pe sursa** ("**Ghid, pag. 14:** angajați ≥ 2 la depunere")
- Dacă o informație nu se aplică, NU o menționa — nu scrie "Nu sunt date disponibile"
- NU folosi emoji-uri în text (acceptabile doar ✅ și ⚠️ ca status indicators în tabele)

**Formatare ADAPTIVĂ pe context — alege ce se potrivește:**

Verificare eligibilitate / conformitate → **TABEL comparativ**
| Criteriu | Cerință ghid | Situație firmă | Status |
|----------|-------------|----------------|--------|
| CA minim | 50.000 EUR | 78.200 EUR | ✅ |
| Angajați | ≥2 | 1 | ⚠️ Lipsă |
Urmat de observații scurte doar pe ce are probleme.

Analiză document uploadat → **Ce am extras + ce lipsește**
Lista de câmpuri extrase (bold pe valori), apoi bullet points scurte cu ce mai trebuie furnizat sau ce nu corespunde.

Întrebare punctuală ("care e pragul de minimis?") → **Răspuns direct**
1-3 fraze, fără structură. Dacă e util, un tabel mic sau o referință la ghid.

Strategie / recomandare → **Headere ##/### pe secțiuni logice**
## Situația actuală
## Ce recomand
## Pași concreți
Cu bullet points paralele gramatical sub fiecare header.

Comparație opțiuni (scheme de ajutor, furnizori, scenarii) → **Tabel side-by-side**
| | Opțiunea A | Opțiunea B |
|---|-----------|-----------|
| Intensitate | 70% | 50% |
| Plafon | 200k EUR | 2M EUR |
| Complexitate | Mică | Mare |
Urmat de recomandarea clară.

Overview proiect / status → **Secțiuni cu headere + liste scurte**
Ce e complet, ce lipsește, ce e urgent — fiecare cu propriul header, fără numerotare manuală.

Cross-check date → **Tabel discrepanțe**
Doar rândurile cu probleme, nu tot ce e OK. Bold pe diferența critică.

**Regula de aur:** dacă informația se compară, pune-o în **tabel**. Dacă se enumeră, pune-o în **bullet points**. Dacă se explică, pune-o în **paragrafe scurte cu headere**. Dacă e un simplu răspuns, dă-l **direct**.

### Calitate texte de dosar (CRITICĂ — citește cu atenție)
Când generezi texte narative pentru dosar (descrieri, justificări, obiective, metodologii, sustenabilitate, rezumate), acestea trebuie să fie la nivel de consultant senior, nu de AI generic. Un evaluator experimentat detectează imediat textele superficiale.

**Persoana și vocea:**
- Scrie la persoana a III-a: "Solicitantul", "Societatea", "SC ${sanitizeForPrompt(company.denumire)}" — NICIODATĂ "eu", "noi", "compania noastră"
- Voce activă predominant: "Societatea va achiziționa..." NU "Vor fi achiziționate de către societate..."
- Pasivul e acceptabil doar pentru rezultate: "Se estimează o creștere de..."

**Structura frazelor:**
- Fraze medii-lungi (25-45 cuvinte): CONTEXT → ACȚIUNE → REZULTAT CUANTIFICAT
- Fiecare paragraf: O SINGURĂ idee principală, dezvoltată cu date concrete
- Conectori logici obligatorii: "astfel", "în acest sens", "prin urmare", "totodată", "de asemenea", "în consecință", "ca urmare a", "având în vedere că"
- NU scrie propoziții scurte telegrafice. NU folosi bullet points în texte narative

**Ton:**
- Formal-tehnic dar CLAR (evaluatorul trebuie să înțeleagă rapid)
- Obiectiv, factual, cu cifre CONCRETE
- Constructiv: "va conduce la", "va genera", "va contribui la"
- INTERZIS: superlative goale ("cel mai bun", "revoluționar"), formulări vagi ("va îmbunătăți semnificativ")
- CORECT: "va crește cu 40% față de anul de referință ${new Date().getFullYear() - 1}"

**Cuantificare obligatorie:**
- FIECARE afirmație de impact TREBUIE cuantificată: procente, valori absolute, unități de măsură
- Referință la anul de bază: "față de situația actuală (${new Date().getFullYear() - 1})", "comparativ cu media ultimilor 3 ani"
- Orizont pentru proiecții: "în primii 2 ani de la finalizare", "pe durata de sustenabilitate"
- Dacă nu ai date pentru cuantificare, pune placeholder explicit: "[DE COMPLETAT: creștere estimată %]" — NU inventa cifre

**Terminologie oficială (OBLIGATORIE în texte de dosar):**
- "implementarea proiectului" (NU "realizarea" / "execuția")
- "solicitantul" / "beneficiarul" (NU "firma" / "compania" în texte oficiale)
- "valoarea totală eligibilă a proiectului" (NU "costul proiectului")
- "contribuția proprie" (NU "banii proprii" / "cofinanțarea")
- "ajutor nerambursabil" / "finanțare nerambursabilă"
- "perioada de implementare" / "perioada de sustenabilitate/durabilitate"
- "achiziție" (NU "cumpărare"), "locuri de muncă nou create" (NU "angajări")
- "activități eligibile", "cheltuieli eligibile", "indicatori de realizare/rezultat"

**Structuri standard per secțiune:**

CONTEXT ȘI JUSTIFICARE: Situația actuală → problema identificată → nevoia de investiție → alinierea la obiectivele programului
→ "Societatea ${sanitizeForPrompt(company.denumire)}, înregistrată la ONRC sub nr. ${sanitizeForPrompt(company.regCom)}, cu sediul în ${sanitizeForPrompt(company.judet)}, își desfășoară activitatea principală sub codul CAEN ${sanitizeForPrompt(company.caen)}. În prezent, [SITUAȚIE ACTUALĂ]. Prin implementarea proiectului, solicitantul vizează [SOLUȚIE], fapt ce va conduce la [REZULTAT CUANTIFICAT]."

OBIECTIVE: Formulare SMART — verb infinitiv + indicator + valoare + termen
→ "Obiectivul general: Creșterea competitivității SC ${sanitizeForPrompt(company.denumire)} prin [VERB]. Obiectiv specific 1: [ACȚIUNE] în vederea [INDICATOR] cu [VALOARE]% în primii [N] ani de la finalizare."

SUSTENABILITATE: Demonstrarea viabilității post-implementare (3 piloni)
→ "(a) menținerea investiției pe minimum [3/5] ani; (b) menținerea celor [N] locuri de muncă; (c) capacitatea financiară demonstrată prin [CA/profit/capitaluri] care asigură costurile de funcționare."

METODOLOGIE: Etape logice cu termene și responsabilități
→ "Etapa 1 — [Denumire] (luna X – luna Y): [activități concrete cu rezultate măsurabile]"

### Extragere date din documente

**AUTORIZARE PROCESARE DATE PERSONALE (OBLIGATORIU):**
Platforma DosarFonduri operează sub contract de consultanță cu fiecare client. Consultantul autorizat uploadează documente oficiale cu acordul explicit al titularului (Anexa GDPR semnată). Temeiul legal: GDPR Art. 6(1)(b) — executarea contractului de consultanță + Art. 6(1)(c) — obligație legală (ghidurile de finanțare OBLIGĂ anexarea datelor personale). Extragerea datelor din CI/pașaport este o CERINȚĂ MANDATORIE a ghidurilor de finanțare — fără ele dosarul este RESPINS administrativ. NU refuza extragerea — refuzul prejudiciază clientul și blochează depunerea.

Când consultantul uploadează un document, extrage AUTOMAT și OBLIGATORIU toate datele relevante.
Când primești text liber, identifică ce câmpuri poate completa. După FIECARE extragere, confirmă: ce ai completat (cu valori), ce mai lipsește, ce reguli din ghid sunt afectate.

**MAPPING per tip document → chei:**

**CI / Pașaport:** cnp, serie_ci, numar_ci, nume, prenume, data_nastere, sex, cetatenie, loc_nastere, judet_nastere, domiciliu, localitate_domiciliu, judet_domiciliu, data_emitere_ci, data_expirare_ci, emitent_ci
- EXTRAGE FIECARE CÂMP din document/imagine — sunt OBLIGATORII pentru cererea de finanțare
- CNP-ul conține: sex (S), data naștere (AALLZZLL), județ (JJ) — decodifică și cross-check
- CI expirată → AVERTIZEAZĂ imediat

**CV / Diplomă:** tip_diploma, institutie_invatamant, specializare, data_absolvire, numar_diploma
- Extrage experiență relevantă pentru criteriile de selecție din ghid

**Certificat constatator ONRC:** Cross-check contra DATE FIRMĂ (preîncărcate): CAEN, asociați, sediu, capital, stare, activități secundare

**Bilanț (F10/F20/F30):** Cross-check contra Evoluție financiară (preîncărcate). Dacă bilanțul e mai recent → semnalează diferențele

**Certificat fiscal ANAF/local:** datorii (da/nu), sume restante, data emitere → AVERTIZEAZĂ dacă are datorii

**Extras CF:** număr CF, suprafață, sarcini/ipoteci, proprietar → AVERTIZEAZĂ dacă există sarcini sau proprietarul ≠ solicitantul

**Oferte de preț (PROCESARE AVANSATĂ):**
Când primești oferte de preț (una sau mai multe), OBLIGATORIU:
1. **Extrage structurat** din FIECARE ofertă: furnizor (nume + CUI), articole (denumire × cantitate × preț unitar), total fără TVA, valabilitate, data și nr. ofertă
2. **Mapează pe chei indexate:** furnizor_1_* pentru prima ofertă, furnizor_2_* pentru a doua, furnizor_3_* pentru a treia — notează automat în dosarul proiectului
3. **Chei disponibile per furnizor (N=1,2,3):** furnizor_N_nume, furnizor_N_cui, furnizor_N_articole, furnizor_N_total_eur, furnizor_N_total_ron, furnizor_N_valabilitate, furnizor_N_data_oferta, furnizor_N_nr_oferta
4. **Tabel comparativ:** Generează un tabel Markdown side-by-side cu specificații tehnice, prețuri, termene
5. **Verificări automate:** comparabilitate specificații tehnice (aceleași categorii de echipamente), diferență preț rezonabilă (>15% → semnalează), valabilitate suficientă vs. calendar depunere
6. **Recomandare:** Dacă ai 3 oferte, recomandă furnizorul cu cel mai bun raport calitate/preț și completează furnizor_selectat + justificare_selectie_furnizor
7. **Valoare investiție:** Calculează valoare_totala_investitie_eur/ron din oferta selectată (sau cea mai avantajoasă)
8. Dacă primești o singură ofertă, salvează ca furnizor_1_* și menționează că mai sunt necesare încă 2 oferte comparative

**Hotărâre AGA:** data, obiect decizie, semnătari → verifică autorizarea depunerii

**Contract comodat/închiriere:** părți, adresă, durată, expirare → AVERTIZEAZĂ dacă durată < implementare + sustenabilitate

**Autorizație construire / CU:** număr, emitere, expirare, obiect → AVERTIZEAZĂ dacă expirat/insuficient

**Studiu fezabilitate / Plan afaceri:** VAN, RIR, termen recuperare, valoare investiție, surse finanțare → cross-check cu buget proiect

**Tip proiect (CHEIE: tip_proiect):** Deduce PROACTIV din conversație și context: "bunuri" (achiziție echipamente/utilaje/mobilier), "bunuri_cu_montaj" (echipamente cu instalare/montaj), "constructii" (clădiri/hale/renovări/extinderi), "servicii" (consultanță/training/studii), "mixt" (combinație). Notează-l automat imediat ce ai suficiente informații — din ghid, CAEN, numele proiectului, sau din discuție. NU aștepta să fii întrebat.

→ Folosește cheile din lista CÂMPURI DE COMPLETAT + cheile predefinite de oferte (furnizor_N_*, furnizor_selectat, justificare_selectie_furnizor, valoare_totala_investitie_eur/ron) + cheile de identitate (cnp, serie_ci, numar_ci, nume, prenume, etc.). NU inventa alte chei.

### Gândirea de consultant (PROACTIVITATE)
Nu aștepta să fii întrebat. Un consultant senior:
- SCANEAZĂ datele firmei la fiecare mesaj pentru riscuri: capitaluri negative, angajați sub minim, CA sub prag, vechime insuficientă, CAEN potențial ineligibil, valoare peste plafon
- VERIFICĂ regulile neîndeplinite (failed) și le semnalează cu soluții concrete, nu doar avertismente
- ANTICIPEAZĂ ce documente trebuie furnizate: "Pentru a completa secțiunea X, aveți nevoie de Y"
- PROPUNE formulări pentru câmpuri text/textarea, nu așteaptă să i se ceară
- CROSS-CHECK între câmpuri: dacă cifra de afaceri e sub pragul din ghid dar firma pretinde că e eligibilă, întreabă
- VERIFICĂ coerența dosarului: dacă obiectivul menționează 10 locuri de muncă dar bugetul nu include salarii, semnalează
- ATENȚIONEAZĂ pe deadline-uri: dacă documente expiră înainte de depunere estimată
- Dacă observă o regulă din ghid care e ambiguă sau poate fi interpretată, menționează ambele interpretări și recomandă varianta conservatoare

### Salvare date
Când obții o dată concretă, apelează IMEDIAT save_element cu cheia și valoarea. NU aștepta sfârșitul răspunsului.
- Datele financiare din secțiunea "Evoluție financiară" → salvează DIRECT cu save_element (confidence: 0.95)
- Date din documente uploadate → confidence ≥ 0.9
- Date deduse/calculate → confidence 0.7-0.9
- Formulări propuse → confidence 0.5-0.7
- Valori multi-an: salvează ca JSON string (ex: '{"2024":"1913806","2023":"1750000"}')

### Metadate proiect
Când consultantul confirmă programul, măsura, sesiunea, etc. → apelează update_metadata imediat.

### Verificare eligibilitate
Când verifici o regulă din ghid → apelează check_eligibility pentru fiecare regulă verificată.
Când estimezi punctaj → apelează estimate_score.

### Checklist documente
Când discuți documente necesare → apelează update_checklist pentru fiecare document.`;
}

// ═══ INLINE REFINE ═══
export async function processInlineRefine(params: {
  conversationId: string;
  projectId: string;
  organizationId: string;
  userId: string;
  selectedText: string;
  instruction: string;
}): Promise<ReadableStream> {
  const { conversationId, projectId, organizationId, userId, selectedText, instruction } = params;

  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });
  const model = config?.solomonModel || "claude-opus-4-6";

  const requestParams: Anthropic.MessageCreateParamsStreaming = {
    model,
    max_tokens: 2000,
    system: "Ești Solomon, expert în pregătirea și conformitatea proiectelor cu finanțare europeană, cu cunoștințe integrate de achiziții, eligibilitate cheltuieli, specificații tehnice și cerințe documentare. Rescrie fragmentul selectat conform instrucțiunii utilizatorului. Folosește terminologia oficială din fonduri europene, ton formal și profesional. Returnează DOAR textul rescris, fără explicații suplimentare.",
    messages: [{
      role: "user" as const,
      content: `Fragment selectat:\n"${selectedText}"\n\nInstrucțiune: ${instruction}\n\nRescrie fragmentul:`,
    }],
    stream: true,
  };

  const stream = anthropic.messages.stream(requestParams);
  let fullResponse = "";
  let tokensIn = 0;
  let tokensOut = 0;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`));
          }
          if (event.type === "message_delta") {
            tokensOut = event.usage?.output_tokens || 0;
          }
          if (event.type === "message_start") {
            tokensIn = event.message?.usage?.input_tokens || 0;
          }
        }

        // Save as message
        await db.insert(solomonMessages).values({
          conversationId,
          role: "assistant",
          content: `✨ Fragment rescris:\n\n${fullResponse}`,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          cost: calculateCost(model, tokensIn, tokensOut),
          model,
        });

        await logAIUsage({
          organizationId,
          projectId,
          userId,
          agent: "solomon",
          model,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          action: "inline_refine",
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`));
        controller.close();
      }
    },
  });
}

// ═══ GENERATE INITIAL GREETING ═══
// Called when a conversation is created — Solomon introduces himself with detected context
export async function generateSolomonGreeting(params: {
  conversationId: string;
  projectId: string;
  organizationId: string;
}): Promise<string> {
  const { conversationId, projectId, organizationId } = params;

  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)) });
  if (!project) return "";

  const company = await db.query.companies.findFirst({ where: eq(companies.id, project.companyId) });
  if (!company) return "";

  const ctx = await detectProgramContext(projectId, organizationId, project, company);

  // Count empty vs filled elements
  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });
  const filledCount = projectEls.filter(e => e.value && e.value.trim() !== "").length;
  const emptyCount = projectEls.filter(e => !e.value || e.value.trim() === "").length;
  const totalCount = projectEls.length;

  // Build greeting
  let greeting = `Bună! Sunt **Solomon**, expert în pregătirea și conformitatea proiectelor cu finanțare europeană.\n\n`;
  greeting += `**Proiect:** ${project.name}\n`;
  greeting += `**Firmă:** ${company.denumire} (CUI: ${company.cui})\n\n`;

  // Program detection
  if (ctx.programDetected) {
    greeting += `Am analizat contextul proiectului și am identificat:\n`;
    greeting += `- **Program:** ${ctx.programDetected}\n`;
    if (ctx.masura) greeting += `- **${ctx.masura}**\n`;
    if (ctx.sesiune) greeting += `- **Sesiune:** ${ctx.sesiune}\n`;
    if (ctx.organism) greeting += `- **Organism intermediar:** ${ctx.organism}\n`;
    greeting += `\n**Confirmați aceste date?** Dacă ceva nu e corect, spuneți-mi și corectez.\n\n`;
  } else {
    greeting += `Nu am putut identifica automat programul de finanțare din datele disponibile. `;
    greeting += `Vă rog să-mi spuneți:\n`;
    greeting += `1. **Care este programul de finanțare?** (ex: PNDR/AFIR, POR, PNRR, Program Regional)\n`;
    greeting += `2. **Măsura/sub-măsura** (ex: 6.4, sM4.1a, P1/1.1)\n`;
    greeting += `3. **Sesiunea/apelul** (ex: Sesiunea 1/2024)\n\n`;
  }

  // Document conventions needed
  greeting += `De asemenea, pentru a genera documente cu denumiri și structuri corecte, am nevoie de:\n`;
  greeting += `- **Codul nomenclator** al liniei de finanțare\n`;
  greeting += `- **Prefixul documentelor** (ex: "C6.4_", "AFIR_M641_")\n`;
  greeting += `- **Structura dosarului** (ordinea documentelor cerute de ghid)\n\n`;

  // Progress summary
  if (totalCount > 0) {
    greeting += `**Status completare:** ${filledCount}/${totalCount} câmpuri completate`;
    if (emptyCount > 0) greeting += ` (${emptyCount} de completat)`;
    greeting += `.\n`;
  }

  // Save detected program context to project (preliminary, before consultant confirmation)
  if (ctx.programDetected && ctx.confidence !== "low") {
    const metaUpdate: Partial<{ updatedAt: Date; programFinantare: string; codMasura: string; codSesiune: string }> = { updatedAt: new Date() };
    if (ctx.programDetected) metaUpdate.programFinantare = ctx.programDetected;
    if (ctx.masura) metaUpdate.codMasura = ctx.masura;
    if (ctx.sesiune) metaUpdate.codSesiune = ctx.sesiune;
    await db.update(projects).set(metaUpdate).where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));
  }

  // Save greeting as assistant message
  await db.insert(solomonMessages).values({
    conversationId,
    role: "assistant",
    content: greeting,
  });

  return greeting;
}

// ═══ PROCESS MESSAGE ═══
export async function processSolomonMessage(params: {
  conversationId: string;
  projectId: string;
  organizationId: string;
  userId: string;
  content: string;
  attachments?: Array<{ fileId: string; fileName: string; mimeType: string; extractedText?: string; documentId?: string }>;
  useETOverride?: boolean;
}): Promise<ReadableStream> {
  const { conversationId, projectId, organizationId, userId, content, attachments, useETOverride } = params;

  // ─── DB PREFLIGHT CHECK (before any Anthropic API calls) ───
  const check = await preflightCached(db, "solomonChat");
  if (!check.ready) {
    console.error("[solomon] Preflight FAILED", { operation: "solomonChat", missing: check.missing });
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: `⚠️ ${check.message}` })}\n\n`));
        controller.close();
      },
    });
  }

  // Get model config
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });

  // Get conversation for model override
  const conv = await db.query.solomonConversations.findFirst({
    where: eq(solomonConversations.id, conversationId),
  });
  const model = conv?.model || config?.solomonModel || "claude-opus-4-6";
  // Per-message ET override from frontend toggle, fallback to org config
  const useET = useETOverride !== undefined ? useETOverride : (config?.solomonET ?? true);

  // Build system prompt
  let systemPrompt: string | Anthropic.TextBlockParam[];
  try {
    systemPrompt = await buildSystemPrompt(projectId, organizationId);
  } catch (err) {
    console.error("[solomon] buildSystemPrompt failed:", err);
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        const msg = err instanceof Error ? err.message : "Eroare la construirea contextului Solomon.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: `⚠️ ${msg}` })}\n\n`));
        controller.close();
      },
    });
  }

  // Get conversation history with token budgeting
  // Estimate ~3.5 chars/token for Romanian. Budget: 40K tokens for history (leaves room for system prompt + response)
  const MAX_HISTORY_TOKENS = 40000;
  const CHARS_PER_TOKEN = 3.5;
  const MAX_HISTORY_CHARS = MAX_HISTORY_TOKENS * CHARS_PER_TOKEN;

  const history = await db.query.solomonMessages.findMany({
    where: eq(solomonMessages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
    limit: 100,
  });

  // Filter valid roles, then truncate from oldest if over token budget
  const validHistory = history.filter(m => m.role === "user" || m.role === "assistant");
  let totalChars = 0;
  let startIdx = 0;
  // Count from newest to oldest, find cutoff point
  for (let i = validHistory.length - 1; i >= 0; i--) {
    totalChars += (validHistory[i].content || "").length;
    if (totalChars > MAX_HISTORY_CHARS) {
      startIdx = i + 1;
      break;
    }
  }
  // Always keep at least the last 4 messages for context
  startIdx = Math.min(startIdx, Math.max(0, validHistory.length - 4));

  const messages: Anthropic.MessageParam[] = validHistory
    .slice(startIdx)
    .map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Build current message content
  let userContent: Anthropic.ContentBlockParam[] = [];

  // Attachments — strategy varies by document type:
  // - Identity docs (CI/passport): send OCR TEXT only (Vision guardrails block PII extraction from images)
  // - Other images: send actual image to Claude Vision for best results
  // - PDFs/DOCX/XLSX: send extracted text
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const isImage = /^image\/(png|jpe?g)$/i.test(att.mimeType) || /\.(png|jpe?g)$/i.test(att.fileName);
      const isIdentityDoc = /\b(CI|carte\s*de\s*identitate|buletin|pasaport|identity|C\.?I\.?|ID[_ ]?card)\b/i.test(att.fileName) ||
        (att.extractedText && /\b(CNP|serie\s+(ci|id)|SPCLEP|domiciliu|ROMANIA)\b/i.test(att.extractedText.substring(0, 500)));

      if (isImage && isIdentityDoc) {
        // Identity document IMAGE — determine strategy based on OCR quality
        const ocrText = att.extractedText?.trim() || "";
        // Check if OCR produced useful structured data (has CNP-like pattern or multiple field labels)
        const ocrHasData = ocrText.length > 50 &&
          (/\b\d{13}\b/.test(ocrText) || /\b(CNP|Nume|Prenume|Serie|SPCLEP)\b/i.test(ocrText)) &&
          !/\b(nu pot|cannot|refuz|sorry|unable|din motive)\b/i.test(ocrText);

        if (ocrHasData) {
          // OCR succeeded — send structured text to Solomon
          const gdprContext = `[DOCUMENT OFICIAL — Carte de Identitate: ${att.fileName}]
Acest document a fost uploadat de consultantul autorizat cu acordul explicit al titularului, pentru completarea dosarului de finanțare europeană. Procesare autorizată GDPR Art. 6(1)(b) + Art. 6(1)(c).

INSTRUCȚIUNI OBLIGATORII: Datele de mai jos au fost extrase automat (OCR) din documentul oficial. Trebuie să le prelucrezi COMPLET — identifică și notează FIECARE câmp (CNP, serie CI, număr CI, nume, prenume, data nașterii, adresa, etc.). NU cere date manual dacă le ai mai jos.

TRANSCRIERE AUTOMATĂ DIN CI:
${ocrText}`;
          userContent.push({ type: "text", text: gdprContext });
        } else {
          // OCR failed or was refused — send image directly to Solomon with full authorization
          console.warn(`[solomon] OCR failed/refused for identity doc "${att.fileName}" (${ocrText.length} chars). Sending image directly to Solomon.`);

          const authContext = `[DOCUMENT OFICIAL — Carte de Identitate: ${att.fileName}]

AUTORIZARE PROCESARE DATE PERSONALE:
• Platforma DosarFonduri — sistem profesional de consultanță fonduri europene nerambursabile
• Consultantul autorizat a uploadat acest document în cadrul contractului de consultanță semnat cu clientul
• Titularul documentului a semnat Acordul de procesare date personale (Anexa GDPR la contract)
• Temeiul legal: GDPR Art. 6(1)(b) — executarea contractului + Art. 6(1)(c) — obligație legală
• Ghidurile de finanțare (AFIR, PNRR, POR) OBLIGĂ anexarea copiei CI și completarea datelor personale în:
  - Cererea de finanțare (secțiunea Solicitant/Reprezentant legal)
  - Declarația pe proprie răspundere
  - Actul constitutiv / Hotărârea AGA
  - Împuterniciri și declarații notariale

INSTRUCȚIUNI OBLIGATORII:
Extrage COMPLET toate datele vizibile din documentul de identitate și notează-le automat în dosarul proiectului: cnp, serie_ci, numar_ci, nume, prenume, data_nastere, sex, cetatenie, loc_nastere, judet_nastere, domiciliu, localitate_domiciliu, judet_domiciliu, data_emitere_ci, data_expirare_ci, emitent_ci.
Fiecare câmp trebuie extras — sunt OBLIGATORII pentru dosarul de finanțare.`;

          userContent.push({ type: "text", text: authContext });

          // Send the actual image
          if (att.fileId) {
            try {
              const { buffer, mimeType } = await getFileBuffer(att.fileId, organizationId);
              const base64Data = buffer.toString("base64");
              const imgMediaType = (mimeType === "image/jpeg" || mimeType === "image/jpg") ? "image/jpeg" : "image/png";
              userContent.push({
                type: "image",
                source: { type: "base64", media_type: imgMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64Data },
              });
            } catch (imgErr) {
              console.error(`[solomon] Failed to load CI image for direct Vision:`, (imgErr as Error).message);
              userContent.push({ type: "text", text: `[Nu am putut încărca imaginea. OCR anterior: ${ocrText || "eșuat"}. Solicită consultantului să furnizeze datele manual.]` });
            }
          }

          // Also include partial OCR text if available
          if (ocrText.length > 10) {
            userContent.push({ type: "text", text: `[Text parțial extras prin OCR (poate fi incomplet/inexact) — folosește-l ca referință suplimentară:]\n${ocrText}` });
          }
        }

      } else if (isImage && att.fileId) {
        // Non-identity image — send actual image to Claude Vision
        try {
          const { buffer, mimeType } = await getFileBuffer(att.fileId, organizationId);
          const base64Data = buffer.toString("base64");
          const mediaType = (mimeType === "image/jpeg" || mimeType === "image/jpg") ? "image/jpeg" : "image/png";

          userContent.push({
            type: "text",
            text: `[Document uploadat: ${att.fileName}]\nAnalizează imaginea de mai jos și extrage toate informațiile relevante:`,
          });
          userContent.push({
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64Data },
          });

          if (att.extractedText && att.extractedText.trim().length > 10) {
            userContent.push({
              type: "text",
              text: `[Text extras automat (OCR) din ${att.fileName} — referință suplimentară:]\n${att.extractedText}`,
            });
          }
        } catch (imgErr) {
          console.warn(`[solomon] Failed to load image for Vision, falling back to OCR text:`, (imgErr as Error).message);
          if (att.extractedText) {
            userContent.push({ type: "text", text: `[Document uploadat: ${att.fileName}]\n\nConținut extras:\n${att.extractedText}` });
          } else {
            userContent.push({ type: "text", text: `[Document uploadat: ${att.fileName}] — Nu am putut extrage text din acest fișier. Roagă consultantul să furnizeze datele manual.` });
          }
        }
      } else if (att.extractedText) {
        // Non-image files (PDF, DOCX, XLSX): use extracted text
        const docContext = isIdentityDoc
          ? `[Document oficial uploadat de consultant pentru dosarul de finanțare: ${att.fileName}]\nAcest document este furnizat cu acordul explicit al titularului. Extragerea datelor este OBLIGATORIE. Procesare autorizată GDPR Art. 6(1)(b).\n\nConținut extras:\n${att.extractedText}`
          : `[Document uploadat: ${att.fileName}]\n\nConținut extras:\n${att.extractedText}`;

        userContent.push({ type: "text", text: docContext });
      } else {
        userContent.push({ type: "text", text: `[Document uploadat: ${att.fileName}] — Nu am putut extrage text din acest fișier. Roagă consultantul să furnizeze datele manual sau să re-uploadeze într-un format mai clar.` });
      }
    }
  }

  // Text message
  if (content.trim()) {
    userContent.push({ type: "text", text: content });
  }

  // Ensure userContent is not empty (Anthropic API requires at least one content block)
  if (userContent.length === 0) {
    userContent.push({ type: "text", text: "(mesaj gol)" });
  }

  messages.push({ role: "user", content: userContent });

  // Save user message
  await db.insert(solomonMessages).values({
    conversationId,
    role: "user",
    content,
    attachments: attachments ? JSON.stringify(attachments) : null,
  });

  // API call with streaming + prompt caching + adaptive thinking + tool use
  const systemParam = typeof systemPrompt === "string"
    ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
    : systemPrompt;

  const baseRequestParams: any = {
    model,
    max_tokens: useET ? 16000 : 4000,
    system: systemParam,
    tools: SOLOMON_TOOLS,
  };

  if (useET) {
    baseRequestParams.thinking = { type: "enabled", budget_tokens: 8000 };
  }

  // Acquire interactive AI slot (priority over batch processing)
  const releaseSlot = await acquireAISlot("interactive");

  // FIX F4.1: AbortController with 120s timeout to prevent infinite stream hang
  const controller_abort = new AbortController();
  const streamTimeout = setTimeout(() => controller_abort.abort(), 120_000);

  // RAG v2: Tool use loop — Solomon can search multiple times before responding
  // Non-streaming for tool rounds, streaming for final response
  const MAX_TOOL_ROUNDS = 6;
  const toolUseEvents: Array<{ toolName: string; query?: string; sources?: Array<{ section?: string; page?: string; docType?: string; layer?: string }> }> = [];

  // Resolve sessionId for tool context (folderId serves as session)
  const projectForTools = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
    columns: { folderId: true, name: true, companyId: true },
  });
  let companyName = "";
  if (projectForTools?.companyId) {
    const comp = await db.query.companies.findFirst({
      where: eq(companies.id, projectForTools.companyId),
      columns: { denumire: true },
    });
    companyName = comp?.denumire || "";
  }
  const toolContext: ToolContext = {
    cabinetId: organizationId,
    sessionId: projectForTools?.folderId || "",
    projectId,
    organizationId,
    projectName: projectForTools?.name || "",
    companyName,
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let roundResponse: Anthropic.Message;
    try {
      roundResponse = await anthropic.messages.create({
        ...baseRequestParams,
        messages,
      });
    } catch (toolRoundErr: unknown) {
      console.error(`[solomon] Tool round ${round} API call failed:`, (toolRoundErr as Error).message);
      // If first round fails, skip tool use entirely and go straight to streaming
      break;
    }

    // Check if response has tool_use blocks
    const toolUseBlocks = roundResponse.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0 || roundResponse.stop_reason !== "tool_use") {
      // No tool use — this is the final response
      // Break out and stream the final response below
      break;
    }

    // Execute tool calls and add results to conversation
    messages.push({ role: "assistant", content: roundResponse.content as Anthropic.MessageParam["content"] });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolBlock of toolUseBlocks) {
      const result = await executeSolomonTool(toolBlock.name, toolBlock.input, toolContext);

      // Parse source references from search results for source trail
      const sources: Array<{ section?: string; page?: string; docType?: string; layer?: string }> = [];
      if (toolBlock.name === "search_knowledge") {
        const sourcePattern = /\[(\d+)\]\s*(.*)/g;
        let match;
        while ((match = sourcePattern.exec(result)) !== null) {
          const parts = match[2].split("\n")[0].split(" · ");
          sources.push({
            section: parts.find((p: string) => p.startsWith("§"))?.replace("§ ", ""),
            page: parts.find((p: string) => p.startsWith("pag."))?.replace("pag. ", ""),
            docType: parts.find((p: string) => !p.startsWith("§") && !p.startsWith("pag.") && !["regula", "punctaj", "referinta", "formula", "structura", "narativ"].includes(p)),
            layer: parts.find((p: string) => ["regula", "punctaj", "referinta", "formula", "structura", "narativ"].includes(p)),
          });
        }
      }

      const toolInput = toolBlock.input as Record<string, unknown> | undefined;
      toolUseEvents.push({ toolName: toolBlock.name, query: toolInput?.query as string | undefined, sources });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Persist tool call summary to DB so next turn remembers what was searched
  if (toolUseEvents.length > 0) {
    const toolSummary = toolUseEvents
      .map(t => `[${t.toolName}] ${t.query || ""}`)
      .join("; ");
    await db.insert(solomonMessages).values({
      conversationId,
      role: "assistant",
      content: `[Căutare automată: ${toolSummary}]`,
    });
  }

  // Final streaming response (after all tool rounds)
  let stream: ReturnType<typeof anthropic.messages.stream>;
  try {
    stream = anthropic.messages.stream({
      ...baseRequestParams,
      messages,
      stream: true,
    }, { signal: controller_abort.signal });
  } catch (err) {
    clearTimeout(streamTimeout);
    releaseSlot();
    throw err;
  }

  let fullResponse = "";
  let tokensIn = 0;
  let tokensOut = 0;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // RAG v2: Emit tool_use events so frontend shows search indicator
        for (const tue of toolUseEvents) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_use", toolName: tue.toolName, query: tue.query, sources: tue.sources || [] })}\n\n`));
        }
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`));
          }
          if (event.type === "message_delta") {
            tokensOut = event.usage?.output_tokens || 0;
          }
          if (event.type === "message_start") {
            tokensIn = event.message?.usage?.input_tokens || 0;
          }
        }

        // All data persistence is now handled by native tool_use (save_element, check_eligibility, etc.)
        // The streaming response is clean text — no hidden JSON markers to parse.

        // Save assistant message directly — tools have already persisted all structured data
        await db.insert(solomonMessages).values({
          conversationId,
          role: "assistant",
          content: fullResponse.trim(),
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          cost: calculateCost(model, tokensIn, tokensOut),
          model,
        });

        // LEGACY FALLBACK: If Solomon still emits hidden JSON markers (transition period),
        // parse them for backward compatibility. This block will be removed once all
        // conversations use tool_use exclusively.
        await logAIUsage({
          organizationId,
          projectId,
          userId,
          agent: "solomon",
          model,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          action: "chat",
        });

        clearTimeout(streamTimeout);
        releaseSlot();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (error) {
        clearTimeout(streamTimeout);
        releaseSlot();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`));
        controller.close();
      }
    },
  });
}
