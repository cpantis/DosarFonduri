import Anthropic from "@anthropic-ai/sdk";
import { anthropic, withAILimit } from "../lib/anthropic";
import { db } from "../db";
import {
  projects, projectElements, templateElements,
  projectEligibility, rules, documents, documentFolders,
  companies, companyFinancials,
  solomonConversations, solomonMessages,
  orgConfig, solomonKnowledge,
  elementRuleLinks, elementDefinitions, guideReferenceTables,
  projectChecklist, scoringCriteria,
} from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logAIUsage } from "./aiUsage";
import { validateElement, logElementChange } from "./elementValidation";
import { checkEligibility } from "./eligibility";
import { computeProjectScores } from "./scoring";
import { publishElementValidated, publishEligibilityUpdated, publishScoreUpdated } from "../lib/sse";
import { preflightCached } from "./dbPreflight";
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
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
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
  const signals: string[] = [];
  let programDetected: string | null = null;
  let masura: string | null = null;
  let sesiune: string | null = null;
  let organism: string | null = null;
  let confidence: "high" | "medium" | "low" = "low";

  // Signal 1: Project name often contains program info
  const nameSignals = project.name?.toLowerCase() || "";
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

  for (const pp of programPatterns) {
    if (pp.pattern.test(nameSignals)) {
      programDetected = pp.program;
      organism = pp.org;
      signals.push(`Numele proiectului conține referință: "${project.name}"`);
      break;
    }
  }

  // Signal 2: Folder hierarchy (session/program structure)
  if (project.folderId) {
    const folder = await db.query.documentFolders.findFirst({
      where: eq(documentFolders.id, project.folderId),
    });
    if (folder) {
      signals.push(`Folder proiect: "${folder.name}"`);
      // Walk up the folder tree to find program/session context
      if (folder.parentId) {
        const parentFolder = await db.query.documentFolders.findFirst({
          where: eq(documentFolders.id, folder.parentId),
        });
        if (parentFolder) {
          signals.push(`Folder părinte: "${parentFolder.name}"`);
          for (const pp of programPatterns) {
            if (pp.pattern.test(parentFolder.name)) {
              if (!programDetected) { programDetected = pp.program; organism = pp.org; }
              break;
            }
          }
          // Check for session pattern (e.g., "Sesiunea 2024", "Apel nr. 3")
          const sesMatch = parentFolder.name.match(/sesiune?a?\s*(\d{4}|\d+)/i) || folder.name.match(/sesiune?a?\s*(\d{4}|\d+)/i);
          if (sesMatch) sesiune = sesMatch[0];
        }
      }
    }
  }

  // Signal 3: Template document names
  const projectEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
    limit: 5,
  });
  const templateDocIds = new Set<string>();
  for (const pe of projectEls.slice(0, 5)) {
    if (!pe.templateElementId) continue;
    const te = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, pe.templateElementId),
    });
    if (te) templateDocIds.add(te.documentId);
  }
  for (const docId of templateDocIds) {
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, docId) });
    if (doc) {
      signals.push(`Template: "${doc.name}"`);
      for (const pp of programPatterns) {
        if (pp.pattern.test(doc.name)) {
          if (!programDetected) { programDetected = pp.program; organism = pp.org; }
          break;
        }
      }
      // Detect masura from document name (e.g., "M6.4", "Masura 4.1")
      const masuraMatch = doc.name.match(/m[aă]sura?\s*(\d+\.?\d*)/i) || doc.name.match(/\bM(\d+\.?\d+)/);
      if (masuraMatch && !masura) masura = `Măsura ${masuraMatch[1]}`;
    }
  }

  // Signal 4: Guide rules content
  const allRules = await db.query.rules.findMany({
    where: eq(rules.organizationId, organizationId),
    limit: 10,
  });
  for (const rule of allRules.slice(0, 5)) {
    const ruleText = rule.description + " " + (rule.sourceText || "");
    for (const pp of programPatterns) {
      if (pp.pattern.test(ruleText)) {
        if (!programDetected) { programDetected = pp.program; organism = pp.org; }
        signals.push(`Regulă din ghid menționează: ${pp.program}`);
        break;
      }
    }
  }

  // Detect masura from project name
  const masuraFromName = nameSignals.match(/m[aă]sura?\s*(\d+\.?\d*)/i) || nameSignals.match(/\bM(\d+\.?\d+)/);
  if (masuraFromName && !masura) masura = `Măsura ${masuraFromName[1]}`;

  // Determine confidence
  const signalCount = signals.length;
  if (programDetected && signalCount >= 3) confidence = "high";
  else if (programDetected && signalCount >= 1) confidence = "medium";
  else confidence = "low";

  return { programDetected, masura, sesiune, organism, confidence, signals };
}

async function buildSystemPrompt(projectId: string, organizationId: string): Promise<string> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new Error("Project not found");

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });
  if (!company) throw new Error("Company not found");

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

  // Load guide reference tables for context
  const refTables = await db.query.guideReferenceTables.findMany({
    where: eq(guideReferenceTables.organizationId, organizationId),
    orderBy: (rt, { asc }) => [asc(rt.name)],
  });
  const refTablesSummary = refTables.map(rt => {
    const rowCount = Array.isArray(rt.data) ? rt.data.length : 0;
    const schemaInfo = Array.isArray(rt.schema) ? rt.schema.map(s => s.label || s.key).join(", ") : "";
    // Include data for lookup/classification tables (essential for Solomon to do lookups)
    // For smaller tables (≤100 rows): include all data
    // For larger tables: include first 50 rows + note about total
    let sampleData = "";
    if (rowCount > 0 && Array.isArray(rt.data)) {
      const maxRows = rowCount <= 200 ? rowCount : 200;
      sampleData = "\n    Date:\n" + rt.data.slice(0, maxRows).map(row =>
        "    " + Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(" | ")
      ).join("\n");
      if (rowCount > maxRows) sampleData += `\n    ... și alte ${rowCount - maxRows} rânduri (verifică în ghid)`;
    }
    return `- **${rt.name}** (${rt.tableType}, ${rowCount} rânduri${rt.lookupKey ? `, cheie: ${rt.lookupKey}` : ""})${schemaInfo ? `\n    Coloane: ${schemaInfo}` : ""}${sampleData}`;
  });

  // Get ALL eligibility rules with their status (not just failed)
  const eligResults = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, projectId),
  });
  const allRules = await db.query.rules.findMany({
    where: eq(rules.organizationId, organizationId),
  });
  const rulesMap = new Map(allRules.map(r => [r.id, r]));
  const eligMap = new Map(eligResults.map(e => [e.ruleId, e]));

  // Categorize rules by status
  const failedRules: string[] = [];
  const pendingRules: string[] = [];
  const passedRules: string[] = [];
  const guideRulesAll: string[] = [];

  for (const rule of allRules) {
    const elig = eligMap.get(rule.id);
    const status = elig?.status || "pending";
    const ruleText = `- ${rule.description}${rule.sourceText ? ` [sursa ghid p.${rule.sourcePage}: "${rule.sourceText.slice(0, 120)}..."]` : ""}`;

    guideRulesAll.push(`- [${rule.type}] ${rule.description}`);

    if (status === "failed") {
      failedRules.push(`- ⚠️ NEÎNDEPLINITĂ: ${rule.description}${elig?.notes ? ` — ${elig.notes}` : ""}`);
    } else if (status === "pending") {
      pendingRules.push(`- ⏳ DE VERIFICAT: ${rule.description}`);
    } else if (status === "passed") {
      passedRules.push(`- ✅ ${rule.description}`);
    }
  }

  // Get project checklist items
  const checklistItems = await db.query.projectChecklist.findMany({
    where: eq(projectChecklist.projectId, projectId),
    orderBy: (c, { asc }) => [asc(c.category), asc(c.sortOrder)],
  });
  const doneItems = checklistItems.filter(i => i.done);
  const missingItems = checklistItems.filter(i => !i.done);

  // Get scoring criteria for the guide document
  const allScoringCriteria = await db.query.scoringCriteria.findMany({
    where: eq(scoringCriteria.organizationId, organizationId),
    orderBy: (c, { asc }) => [asc(c.category), asc(c.sortOrder)],
  });
  const totalMaxPoints = allScoringCriteria.reduce((sum, c) => sum + Number(c.maxPoints), 0);

  // Company financials (all years for trends)
  const allFinancials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
    limit: 3,
  });
  const latestFinancial = allFinancials[0] || null;

  // Build financial history section
  const financialHistory = allFinancials.map(f => {
    const f20 = f.f20 as any;
    const f30 = f.f30 as any;
    const f10 = f.f10 as any;
    return `  ${f.year}: CA=${f20?.cifraAfaceriNeta || "?"} RON | Profit=${f20?.profitNet || "?"} RON | Angajați=${f30?.numarMediuSalariati || "?"} | Cap. proprii=${f10?.capitaluriProprii || "?"}`;
  }).join("\n");

  // Load knowledge base updates (legislative changes, corrections, best practices)
  const now = new Date();
  const knowledgeEntries = await db.query.solomonKnowledge.findMany({
    where: and(
      eq(solomonKnowledge.organizationId, organizationId),
      eq(solomonKnowledge.enabled, true),
    ),
    orderBy: (k, { desc }) => [desc(k.priority), desc(k.createdAt)],
    limit: 100,
  });
  // Filter valid entries (validFrom <= now && (validUntil is null or >= now))
  const activeKnowledge = knowledgeEntries.filter(k => {
    if (k.validFrom && k.validFrom > now) return false;
    if (k.validUntil && k.validUntil < now) return false;
    return true;
  });

  // Compute derived fields
  const currentYear = new Date().getFullYear();
  const vechimeAni = company.anInfiintare ? currentYear - Number(company.anInfiintare) : null;
  const capitaluriProprii = (latestFinancial?.f10 as any)?.capitaluriProprii;
  const cifraAfaceri = (latestFinancial?.f20 as any)?.cifraAfaceriNeta;
  const profitNet = (latestFinancial?.f20 as any)?.profitNet;
  const nrAngajati = (latestFinancial?.f30 as any)?.numarMediuSalariati;

  return `Ești Solomon — consultant senior cu experiență vastă în fonduri europene și nerambursabile, integrat în platforma DosarFonduri. Lucrezi pe dosarul "${project.name}" pentru "${company.denumire}" (CUI: ${company.cui}).

═══════════════════════════════════════════
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

1. **REGULILE DIN GHIDUL DE FINANȚARE** (extrase automat, listate mai jos) → SURSĂ PRIMARĂ DE ADEVĂR
   - Au prioritate absolută. Dacă ghidul contrazice o practică generală, aplică GHIDUL
   - Citează sursa când aplici o regulă: "Conform ghidului, pag. X..."
2. **ACTUALIZĂRI ȘI CUNOȘTINȚE NOI** (din biblioteca de sesiune, listate mai jos) → SUPRASCRIU training-ul tău
   - Dacă o actualizare modifică un prag/procedură/regulă, aplică ACTUALIZAREA, nu ce știi tu
3. **DATELE FIRMEI** (ONRC + bilanțuri, mai jos) → CONTEXT FACTUAL — nu modifica, nu inventa
4. **EXPERTIZA TA** → completează unde ghidul și actualizările tac: formulare, bune practici, avertismente, analiză de risc

═══════════════════════════════════════════
## DATE FIRMĂ (din ONRC + bilanțuri)
═══════════════════════════════════════════

- Denumire: ${sanitizeForPrompt(company.denumire)}
- CUI: ${sanitizeForPrompt(company.cui)}
- Forma juridică: ${sanitizeForPrompt(company.formaJuridica)}
- CAEN principal: ${sanitizeForPrompt(company.caen)}
- Nr. Reg. Com.: ${sanitizeForPrompt((company as any).registrationNumber)}
- Adresă: ${sanitizeForPrompt(company.adresa)}, Județ: ${sanitizeForPrompt(company.judet)}
- An înființare: ${company.anInfiintare || "necunoscut"}${vechimeAni !== null ? ` (vechime: ${vechimeAni} ani)` : ""}
- Status: ${sanitizeForPrompt(company.stare)}

### Situație financiară
- Angajați (ultimul an): ${nrAngajati || "necunoscut"}
- Cifra de afaceri netă: ${cifraAfaceri || "necunoscut"} RON
- Profit net: ${profitNet || "necunoscut"} RON
- Capitaluri proprii: ${capitaluriProprii || "necunoscut"} RON${capitaluriProprii && Number(capitaluriProprii) < 0 ? " ⚠️ NEGATIVE — risc eligibilitate!" : ""}

### Evoluție financiară (ultimii ani)
${financialHistory || "Nu sunt disponibile date financiare multi-an."}

**ACȚIUNE AUTOMATĂ:** Dacă în lista CÂMPURI DE COMPLETAT există elemente financiare (cifra de afaceri, profit net, capitaluri proprii, număr angajați, etc.) și datele de mai sus conțin valorile corespunzătoare, completează-le AUTOMAT în ELEMENTS_JSON la PRIMUL mesaj fără a fi întrebat. Acestea sunt date oficiale ANAF — confidence 0.95.

═══════════════════════════════════════════
## REGULI DIN GHIDUL DE FINANȚARE (PRIORITARE)
═══════════════════════════════════════════
${guideRulesAll.length > 0 ? `Ghidul de finanțare conține ${guideRulesAll.length} reguli extrase automat.
Aplică-le cu PRIORITATE MAXIMĂ în orice sfat dai consultantului.

${failedRules.length > 0 ? `### ⚠️ REGULI NEÎNDEPLINITE (${failedRules.length}) — PRIORITATE CRITICĂ
${failedRules.join("\n")}
→ Semnalează IMEDIAT aceste probleme consultantului. Sugerează soluții concrete.
` : ""}
${pendingRules.length > 0 ? `### ⏳ REGULI ÎN AȘTEPTARE (${pendingRules.length}) — DE VERIFICAT
${pendingRules.join("\n")}
→ Cere consultantului informațiile necesare pentru a le verifica.
` : ""}
${passedRules.length > 0 ? `### ✅ REGULI ÎNDEPLINITE (${passedRules.length})
${passedRules.slice(0, 15).join("\n")}${passedRules.length > 15 ? `\n... și alte ${passedRules.length - 15} reguli îndeplinite` : ""}
` : ""}` : "Nu au fost extrase încă reguli din ghidul de finanțare. Întreabă consultantul dacă ghidul a fost încărcat."}

${activeKnowledge.length > 0 ? `═══════════════════════════════════════════
## ACTUALIZĂRI LEGISLATIVE ȘI CUNOȘTINȚE NOI (${activeKnowledge.length})
═══════════════════════════════════════════
Următoarele actualizări au fost adăugate de consultant/admin și AU PRIORITATE față de cunoștințele tale implicite:

${activeKnowledge.map(k => {
  let entry = `### [${k.category.toUpperCase()}] ${k.title}`;
  if (k.sourceReference) entry += `\nSursă: ${k.sourceReference}`;
  if (k.sourceUrl) entry += ` (${k.sourceUrl})`;
  if (k.validFrom) entry += `\nÎn vigoare de la: ${k.validFrom.toISOString().split("T")[0]}`;
  if (k.validUntil) entry += ` | Expiră: ${k.validUntil.toISOString().split("T")[0]}`;
  entry += `\n${k.content}`;
  return entry;
}).join("\n\n")}
` : ""}
${checklistItems.length > 0 ? `═══════════════════════════════════════════
## CHECKLIST DOCUMENTE PROIECT
═══════════════════════════════════════════
Documente depuse (${doneItems.length}/${checklistItems.length}):
${doneItems.map(i => `✅ ${i.name} (${i.category})`).join("\n")}

Documente LIPSĂ:
${missingItems.map(i => `❌ ${i.name} (${i.category})`).join("\n")}

Dacă utilizatorul întreabă ce documente mai are nevoie, răspunde din această listă. Dacă un document lipsă e critic pentru completarea câmpurilor, menționează proactiv.
` : ""}
${allScoringCriteria.length > 0 ? `═══════════════════════════════════════════
## CRITERII DE SELECȚIE (SCORING)
═══════════════════════════════════════════
Total punctaj maxim: ${totalMaxPoints} puncte
Prag calitate estimat: 56 puncte

Per criteriu:
${allScoringCriteria.map(c => `- ${c.name} (max ${c.maxPoints}p): ${c.evaluationLogic ? JSON.stringify(c.evaluationLogic) : "fără logică definită"}`).join("\n")}

Când completezi câmpuri, menționează impactul pe punctaj: "Dacă setezi X la valoarea Y, câștigi Z puncte la criteriul W."
` : ""}
═══════════════════════════════════════════
## CÂMPURI DE COMPLETAT (${emptyElements.length} rămase)
═══════════════════════════════════════════
${emptyElements.length > 0 ? emptyElements.join("\n") : "Toate câmpurile sunt completate!"}

## CÂMPURI DEJA COMPLETATE (${filledElements.length})
${filledElements.length > 0 ? filledElements.slice(0, 30).join("\n") : "Niciun câmp completat încă."}
${filledElements.length > 30 ? `\n... și alte ${filledElements.length - 30} câmpuri` : ""}

${refTablesSummary.length > 0 ? `═══════════════════════════════════════════
## TABELE DE REFERINȚĂ DIN GHID (${refTablesSummary.length})
═══════════════════════════════════════════
Aceste tabele au fost extrase din anexele ghidului. Folosește-le pentru validare:
- Când consultantul furnizează o valoare, verifică dacă se încadrează în tabelele relevante
- Exemplu: dacă furnizează "suprafața = 270 ha" și "putere tractor = 150 CP", verifică corelare din tabelul corespunzător
- Dacă o valoare NU se regăsește în tabele, avertizează: "Conform anexei X, valoarea [Y] nu se încadrează în [Z]"

${refTablesSummary.join("\n\n")}
` : ""}
${await (async () => {
  // Build element→rule mapping from elementRuleLinks
  // Load ALL links for the org's elements (both templateElementId and elementDefId paths)
  const tmplElIds = tmplElements.map(te => te.id);
  const elemDefIds = elemDefs.map(ed => ed.id);

  // Batch load links by templateElementId
  const tmplLinks = tmplElIds.length > 0
    ? await db.query.elementRuleLinks.findMany({
        where: inArray(elementRuleLinks.templateElementId, tmplElIds),
      })
    : [];

  // Batch load links by elementDefId
  const edLinks = elemDefIds.length > 0
    ? await db.query.elementRuleLinks.findMany({
        where: inArray(elementRuleLinks.elementDefId, elemDefIds),
      })
    : [];

  // Merge and deduplicate (prefer elementDefId links)
  const seenPairs = new Set<string>();
  const allLinks: Array<{ key: string; label: string; ruleDesc: string }> = [];

  for (const link of edLinks) {
    if (!link.elementDefId) continue;
    const ed = elemDefMap.get(link.elementDefId);
    const rule = rulesMap.get(link.ruleId);
    if (!ed || !rule) continue;
    const pairKey = `${ed.elementKey}:${rule.id}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    allLinks.push({ key: ed.elementKey, label: ed.displayName, ruleDesc: rule.description });
  }

  for (const link of tmplLinks) {
    if (!link.templateElementId) continue;
    const te = tmplMap.get(link.templateElementId);
    const rule = rulesMap.get(link.ruleId);
    if (!te || !rule) continue;
    const pairKey = `${te.key}:${rule.id}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    allLinks.push({ key: te.key, label: te.label, ruleDesc: rule.description });
  }

  if (allLinks.length === 0) return "";

  // Group by element key
  const byKey = new Map<string, { label: string; rules: string[] }>();
  for (const link of allLinks) {
    const existing = byKey.get(link.key) || { label: link.label, rules: [] };
    existing.rules.push(link.ruleDesc);
    byKey.set(link.key, existing);
  }

  const mappingLines = [...byKey.entries()].map(([key, { label, rules }]) =>
    `- **${label}** (${key}): ${rules.join("; ")}`
  );

  return `═══════════════════════════════════════════
## MAPARE CÂMP → REGULĂ
═══════════════════════════════════════════
Următoarele câmpuri sunt direct legate de reguli din ghid. Când colectezi aceste date, verifică automat că valorile respectă regulile:
${mappingLines.join("\n")}
`;
})()}
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
→ "Societatea ${sanitizeForPrompt(company.denumire)}, înregistrată la ONRC sub nr. ${sanitizeForPrompt((company as any).registrationNumber)}, cu sediul în ${sanitizeForPrompt(company.judet)}, își desfășoară activitatea principală sub codul CAEN ${sanitizeForPrompt(company.caen)}. În prezent, [SITUAȚIE ACTUALĂ]. Prin implementarea proiectului, solicitantul vizează [SOLUȚIE], fapt ce va conduce la [REZULTAT CUANTIFICAT]."

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
2. **Mapează pe chei indexate:** furnizor_1_* pentru prima ofertă, furnizor_2_* pentru a doua, furnizor_3_* pentru a treia — salvează în ELEMENTS_JSON
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

**Tip proiect (CHEIE: tip_proiect):** Deduce PROACTIV din conversație și context: "bunuri" (achiziție echipamente/utilaje/mobilier), "bunuri_cu_montaj" (echipamente cu instalare/montaj), "constructii" (clădiri/hale/renovări/extinderi), "servicii" (consultanță/training/studii), "mixt" (combinație). Setează-l în ELEMENTS_JSON imediat ce ai suficiente informații — din ghid, CAEN, numele proiectului, sau din discuție. NU aștepta să fii întrebat.

→ Folosește cheile din lista CÂMPURI DE COMPLETAT + cheile predefinite de oferte (furnizor_N_*, furnizor_selectat, justificare_selectie_furnizor, valoare_totala_investitie_eur/ron) + cheile de identitate (cnp, serie_ci, numar_ci, nume, prenume, etc.). NU inventa alte chei. Dacă un câmp nu are corespondent, menționează-l în conversație dar NU-l include în ELEMENTS_JSON.

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

### Format extragere
6. IMPORTANT: returnează câmpurile extrase în format JSON ascuns la sfârșitul mesajului:
   <!--ELEMENTS_JSON[{"key": "camp", "value": "valoare", "confidence": 0.95}]ELEMENTS_JSON-->
   - key = cheia câmpului din lista de mai sus
   - value = valoarea extrasă/formulată
   - confidence = 0.0-1.0 (cât de sigur ești de extragere)
   - Dacă ai extras dintr-un document uploadat, confidence ≥ 0.9
   - Dacă ai dedus/calculat, confidence 0.7-0.9
   - Dacă ai propus o formulare, confidence 0.5-0.7 (necesită confirmare consultant)

   **VALORI STRUCTURATE (multi-an, tabelar):** Când un element reprezintă date pe mai mulți ani sau categorii (ex: "Cifra de afaceri ultimii 3 ani", "Număr angajați pe ani", "Capitaluri proprii pe ani"), salvează valoarea ca JSON structurat:
   - Exemplu multi-an: {"2024": "1913806", "2023": "1750000", "2022": "1520000"}
   - Exemplu tabel: [{"an": "2024", "CA": "1913806", "profit": "125000"}, {"an": "2023", ...}]
   - IMPORTANT: Datele financiare ale firmei sunt deja listate în secțiunea "Evoluție financiară". Folosește-le DIRECT — nu cere consultantului date pe care le ai deja!
   - Dacă ai date parțiale (ex: doar 2024, lipsesc 2022-2023), salvează ce ai cu confidence 0.9 pentru datele existente și menționează ce lipsește

   **CERERE EXPLICITĂ DE COMPLETARE:** Când consultantul scrie "Completează elementul X (cheie: Y)" sau similar, TREBUIE OBLIGATORIU să:
   (a) Propui o valoare concretă bazată pe datele disponibile (firmă, ghid, conversație anterioară)
   (b) Returnezi ELEMENTS_JSON cu cheia specificată și valoarea propusă
   (c) Dacă nu ai suficiente date, explică ce lipsește dar propune o valoare parțială cu confidence scăzut (0.3-0.5)
   NU răspunde doar conversațional fără ELEMENTS_JSON când primești cerere explicită de completare.

### Format metadate proiect (CRITIC pentru Neemia)
7. Când consultantul CONFIRMĂ sau furnizează informații despre program, nomenclator, prefix, structura dosarului, cod MySMIS sau sesiune, returnează-le în format JSON ascuns:
   <!--METADATA_JSON{"programFinantare":"PNDR/AFIR","codMasura":"6.4","codSesiune":"Sesiunea 1/2024","codNomenclator":"sM6.4","prefixDocumente":"C6.4_","codMysmis":"12345","tipProiect":"bunuri_cu_montaj","structuraDosar":"1. Cerere finanțare\\n2. Plan de afaceri\\n3. Anexe tehnice"}METADATA_JSON-->
   - Includ DOAR câmpurile pe care le-ai obținut (confirmate de consultant sau deduse cu certitudine)
   - Nu inventa valori — include doar ce a confirmat/furnizat consultantul sau ce ai detectat automat și consultantul a confirmat
   - Actualizează câmpurile la fiecare confirmare/corecție din conversație
   - Aceste metadate sunt ESENȚIALE — Neemia le folosește pentru denumirea și structurarea documentelor generate`;
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

  const requestParams: any = {
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
          if (event.type === "content_block_delta") {
            const delta = event.delta as any;
            if (delta.type === "text_delta") {
              fullResponse += delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: delta.text })}\n\n`));
            }
          }
          if (event.type === "message_delta") {
            tokensOut = (event as any).usage?.output_tokens || 0;
          }
          if (event.type === "message_start") {
            tokensIn = (event as any).message?.usage?.input_tokens || 0;
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

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
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
    const metaUpdate: any = { updatedAt: new Date() };
    if (ctx.programDetected) metaUpdate.programFinantare = ctx.programDetected;
    if (ctx.masura) metaUpdate.codMasura = ctx.masura;
    if (ctx.sesiune) metaUpdate.codSesiune = ctx.sesiune;
    await db.update(projects).set(metaUpdate).where(eq(projects.id, projectId));
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
  const systemPrompt = await buildSystemPrompt(projectId, organizationId);

  // Get conversation history
  const history = await db.query.solomonMessages.findMany({
    where: eq(solomonMessages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
    limit: 50,
  });

  // Build messages array — only allow valid roles (user/assistant), skip system messages
  const messages: Anthropic.MessageParam[] = history
    .filter(m => m.role === "user" || m.role === "assistant")
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

INSTRUCȚIUNI OBLIGATORII: Datele de mai jos au fost extrase automat (OCR) din documentul oficial. Trebuie să le prelucrezi COMPLET — identifică și salvează FIECARE câmp (CNP, serie CI, număr CI, nume, prenume, data nașterii, adresa, etc.) folosind formatul ELEMENTS_JSON. NU cere date manual dacă le ai mai jos.

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
Extrage COMPLET toate datele vizibile din documentul de identitate și salvează-le folosind formatul ELEMENTS_JSON cu cheile: cnp, serie_ci, numar_ci, nume, prenume, data_nastere, sex, cetatenie, loc_nastere, judet_nastere, domiciliu, localitate_domiciliu, judet_domiciliu, data_emitere_ci, data_expirare_ci, emitent_ci.
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

  // API call with streaming
  const requestParams: any = {
    model,
    max_tokens: useET ? 16000 : 4000,
    system: systemPrompt,
    messages,
    stream: true,
  };

  if (useET) {
    requestParams.thinking = { type: "enabled", budget_tokens: 8000 };
  }

  // FIX F4.1: AbortController with 120s timeout to prevent infinite stream hang
  const controller_abort = new AbortController();
  const streamTimeout = setTimeout(() => controller_abort.abort(), 120_000);

  let stream: ReturnType<typeof anthropic.messages.stream>;
  try {
    stream = anthropic.messages.stream(requestParams, { signal: controller_abort.signal });
  } catch (err) {
    clearTimeout(streamTimeout);
    throw err;
  }

  let fullResponse = "";
  let tokensIn = 0;
  let tokensOut = 0;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            const delta = event.delta as any;
            if (delta.type === "text_delta") {
              fullResponse += delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: delta.text })}\n\n`));
            }
          }
          if (event.type === "message_delta") {
            tokensOut = (event as any).usage?.output_tokens || 0;
          }
          if (event.type === "message_start") {
            tokensIn = (event as any).message?.usage?.input_tokens || 0;
          }
        }

        // Extract elements from response (hidden JSON format)
        const elementsMatch = fullResponse.match(/<!--ELEMENTS_JSON(\[[\s\S]*?\])ELEMENTS_JSON-->/);
        let extractedElements: any[] = [];
        if (elementsMatch) {
          try {
            const parsed = JSON.parse(elementsMatch[1]);
            // Validate: must be an array, cap at 200 elements, each must have key+value strings
            if (Array.isArray(parsed)) {
              extractedElements = parsed
                .slice(0, 200)
                .filter((el: any) =>
                  el && typeof el.key === "string" && el.key.length <= 255
                  && typeof el.value === "string" && el.value.length <= 10000
                )
                .map((el: any) => ({
                  ...el,
                  confidence: Math.min(1, Math.max(0, Number(el.confidence) || 0.5)),
                }));
            }
          } catch (parseErr) {
            // FIX F4.3: Log parse failure instead of silently swallowing
            console.warn("[solomon] ELEMENTS_JSON parse failed", { error: parseErr, rawMatch: elementsMatch[1]?.slice(0, 200) });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "extraction_warning",
              message: "Nu am putut extrage date structurate din răspuns. Răspunsul conversațional e valid.",
            })}\n\n`));
          }
        }

        // Save extracted elements to project — using elementDefinitions as primary, templateElements as fallback
        if (extractedElements.length > 0) {
          // Load elementDefinitions (canonical source of truth)
          const orgElemDefs = await db.query.elementDefinitions.findMany({
            where: eq(elementDefinitions.organizationId, organizationId),
          });
          const keyToElemDef = new Map(orgElemDefs.map(ed => [ed.elementKey, ed]));

          // Load templateElements as fallback for legacy keys
          const orgTmplEls = await db.query.templateElements.findMany({
            where: eq(templateElements.organizationId, organizationId),
          });
          const keyToTmplEl = new Map(orgTmplEls.map(t => [t.key, t]));

          // Batch-load all existing project elements for this project
          const allProjectElements = await db.query.projectElements.findMany({
            where: eq(projectElements.projectId, projectId),
          });
          // Build lookup maps: elementDefId → PE, templateElementId → PE
          const peByDefId = new Map(allProjectElements.filter(pe => pe.elementDefId).map(pe => [pe.elementDefId!, pe]));
          const peByTmplId = new Map(allProjectElements.filter(pe => pe.templateElementId).map(pe => [pe.templateElementId!, pe]));

          const toUpdate: Array<{ id: string; value: string; oldValue: string | null; elementDefId?: string }> = [];
          const toInsert: Array<{ projectId: string; elementDefId?: string; templateElementId?: string; value: string; source: "solomon_chat"; confirmed: boolean; validationStatus: "pending" }> = [];
          const modifiedElementIds: string[] = [];

          // Known client document field definitions for auto-creation
          const CLIENT_DOC_FIELD_DEFS: Record<string, { displayName: string; category: "beneficiary" | "legal" | "location" | "other"; dataType: "text" | "number" | "date"; required?: boolean }> = {
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
            tip_diploma: { displayName: "Tip diplomă", category: "beneficiary", dataType: "text" },
            institutie_invatamant: { displayName: "Instituție învățământ", category: "beneficiary", dataType: "text" },
            specializare: { displayName: "Specializare", category: "beneficiary", dataType: "text" },
            data_absolvire: { displayName: "Data absolvire", category: "beneficiary", dataType: "date" },
            numar_diploma: { displayName: "Număr diplomă", category: "beneficiary", dataType: "text" },
            tip_proiect: { displayName: "Tip proiect (bunuri / construcții / servicii / mixt)", category: "other", dataType: "text", required: true },
            // ── Oferte de preț (3 furnizori) ──
            furnizor_1_nume: { displayName: "Furnizor 1 — Nume", category: "other", dataType: "text" },
            furnizor_1_cui: { displayName: "Furnizor 1 — CUI", category: "other", dataType: "text" },
            furnizor_1_articole: { displayName: "Furnizor 1 — Articole (denumire × cantitate)", category: "other", dataType: "text" },
            furnizor_1_total_eur: { displayName: "Furnizor 1 — Total fără TVA (EUR)", category: "other", dataType: "number" },
            furnizor_1_total_ron: { displayName: "Furnizor 1 — Total fără TVA (RON)", category: "other", dataType: "number" },
            furnizor_1_valabilitate: { displayName: "Furnizor 1 — Valabilitate ofertă", category: "other", dataType: "text" },
            furnizor_1_data_oferta: { displayName: "Furnizor 1 — Data ofertă", category: "other", dataType: "date" },
            furnizor_1_nr_oferta: { displayName: "Furnizor 1 — Nr. ofertă", category: "other", dataType: "text" },
            furnizor_2_nume: { displayName: "Furnizor 2 — Nume", category: "other", dataType: "text" },
            furnizor_2_cui: { displayName: "Furnizor 2 — CUI", category: "other", dataType: "text" },
            furnizor_2_articole: { displayName: "Furnizor 2 — Articole (denumire × cantitate)", category: "other", dataType: "text" },
            furnizor_2_total_eur: { displayName: "Furnizor 2 — Total fără TVA (EUR)", category: "other", dataType: "number" },
            furnizor_2_total_ron: { displayName: "Furnizor 2 — Total fără TVA (RON)", category: "other", dataType: "number" },
            furnizor_2_valabilitate: { displayName: "Furnizor 2 — Valabilitate ofertă", category: "other", dataType: "text" },
            furnizor_2_data_oferta: { displayName: "Furnizor 2 — Data ofertă", category: "other", dataType: "date" },
            furnizor_2_nr_oferta: { displayName: "Furnizor 2 — Nr. ofertă", category: "other", dataType: "text" },
            furnizor_3_nume: { displayName: "Furnizor 3 — Nume", category: "other", dataType: "text" },
            furnizor_3_cui: { displayName: "Furnizor 3 — CUI", category: "other", dataType: "text" },
            furnizor_3_articole: { displayName: "Furnizor 3 — Articole (denumire × cantitate)", category: "other", dataType: "text" },
            furnizor_3_total_eur: { displayName: "Furnizor 3 — Total fără TVA (EUR)", category: "other", dataType: "number" },
            furnizor_3_total_ron: { displayName: "Furnizor 3 — Total fără TVA (RON)", category: "other", dataType: "number" },
            furnizor_3_valabilitate: { displayName: "Furnizor 3 — Valabilitate ofertă", category: "other", dataType: "text" },
            furnizor_3_data_oferta: { displayName: "Furnizor 3 — Data ofertă", category: "other", dataType: "date" },
            furnizor_3_nr_oferta: { displayName: "Furnizor 3 — Nr. ofertă", category: "other", dataType: "text" },
            furnizor_selectat: { displayName: "Furnizor selectat (1, 2 sau 3)", category: "other", dataType: "text" },
            justificare_selectie_furnizor: { displayName: "Justificare selecție furnizor", category: "other", dataType: "text" },
            valoare_totala_investitie_eur: { displayName: "Valoare totală investiție fără TVA (EUR)", category: "other", dataType: "number" },
            valoare_totala_investitie_ron: { displayName: "Valoare totală investiție fără TVA (RON)", category: "other", dataType: "number" },
          };

          // Find guide document for auto-creating element definitions
          let guideDocIdCache: string | null | undefined = undefined;
          async function getGuideDocId(): Promise<string | null> {
            if (guideDocIdCache !== undefined) return guideDocIdCache;
            const proj = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
            if (!proj) { guideDocIdCache = null; return null; }
            // Find ghiduri subfolder
            const ghiduriFolder = await db.query.documentFolders.findFirst({
              where: and(
                eq(documentFolders.parentId, proj.folderId),
                eq(documentFolders.type, "ghiduri"),
                eq(documentFolders.organizationId, organizationId),
              ),
            });
            if (ghiduriFolder) {
              const guide = await db.query.documents.findFirst({
                where: and(eq(documents.folderId, ghiduriFolder.id), eq(documents.processingType, "ghid"), eq(documents.status, "processed")),
              });
              guideDocIdCache = guide?.id ?? null;
            } else {
              guideDocIdCache = null;
            }
            return guideDocIdCache;
          }

          for (const el of extractedElements) {
            let elemDef = keyToElemDef.get(el.key);
            const tmplEl = keyToTmplEl.get(el.key);

            // Auto-create elementDefinition for known client doc fields
            if (!elemDef && !tmplEl && CLIENT_DOC_FIELD_DEFS[el.key]) {
              const guideDocId = await getGuideDocId();
              try {
                const knownDef = CLIENT_DOC_FIELD_DEFS[el.key];
                const created = await upsertElementDefinition({
                  guideDocumentId: guideDocId,
                  organizationId,
                  elementKey: el.key,
                  displayName: knownDef.displayName,
                  category: knownDef.category,
                  dataType: knownDef.dataType,
                  required: knownDef.required ?? false,
                  sourcePriority: ["document_extracted", "solomon_chat", "consultant_manual"],
                });
                elemDef = created;
                keyToElemDef.set(el.key, created);
                console.log(`[solomon] Auto-created elementDefinition for "${el.key}" → ${created.id}`);
              } catch (err) {
                console.warn(`[solomon] Failed to auto-create elementDef for "${el.key}":`, err);
              }
            }

            if (!elemDef && !tmplEl) continue;

            // Find existing from in-memory maps
            const existing = (elemDef ? peByDefId.get(elemDef.id) : null) || (tmplEl ? peByTmplId.get(tmplEl.id) : null);

            if (existing) {
              if (existing.confirmed && (existing.source === "consultant_manual" || existing.source === "document_extracted")) {
                console.log(`[solomon] Skipping confirmed element ${el.key} (source: ${existing.source})`);
              } else {
                toUpdate.push({
                  id: existing.id,
                  value: el.value,
                  oldValue: existing.value || null,
                  ...(elemDef && !existing.elementDefId ? { elementDefId: elemDef.id } : {}),
                });
                modifiedElementIds.push(existing.id);
              }
            } else {
              toInsert.push({
                projectId,
                ...(elemDef ? { elementDefId: elemDef.id } : {}),
                ...(tmplEl ? { templateElementId: tmplEl.id } : {}),
                value: el.value,
                source: "solomon_chat",
                confirmed: false,
                validationStatus: "pending",
              });
            }
          }

          // Batch updates
          for (const upd of toUpdate) {
            await db.update(projectElements).set({
              value: upd.value,
              source: "solomon_chat",
              confirmed: false,
              ...(upd.elementDefId ? { elementDefId: upd.elementDefId } : {}),
              updatedAt: new Date(),
            }).where(eq(projectElements.id, upd.id));
            await logElementChange({
              projectElementId: upd.id,
              oldValue: upd.oldValue,
              newValue: upd.value,
              changedBy: userId,
              changeSource: "solomon",
            });
          }

          // Batch inserts
          if (toInsert.length > 0) {
            try {
              const inserted = await db.insert(projectElements).values(toInsert).returning({ id: projectElements.id });
              modifiedElementIds.push(...inserted.map(r => r.id));
              for (let idx = 0; idx < inserted.length; idx++) {
                await logElementChange({
                  projectElementId: inserted[idx].id,
                  oldValue: null,
                  newValue: toInsert[idx].value || null,
                  changedBy: userId,
                  changeSource: "solomon",
                });
              }
            } catch (insertErr: any) {
              // Fallback to per-element insert on conflict
              if (insertErr.code === "23505") {
                console.warn(`[solomon] Batch insert conflict — falling back to per-element upsert`);
                for (const row of toInsert) {
                  try {
                    const [ins] = await db.insert(projectElements).values(row).returning({ id: projectElements.id });
                    modifiedElementIds.push(ins.id);
                    await logElementChange({
                      projectElementId: ins.id,
                      oldValue: null,
                      newValue: row.value || null,
                      changedBy: userId,
                      changeSource: "solomon",
                    });
                  } catch (perErr: any) {
                    if (perErr.code === "23505") {
                      const retryExisting = await db.query.projectElements.findFirst({
                        where: and(
                          eq(projectElements.projectId, projectId),
                          row.elementDefId ? eq(projectElements.elementDefId, row.elementDefId) : eq(projectElements.templateElementId, row.templateElementId!),
                        ),
                      });
                      if (retryExisting) {
                        await db.update(projectElements).set({ value: row.value, source: "solomon_chat", confirmed: false, updatedAt: new Date() }).where(eq(projectElements.id, retryExisting.id));
                        modifiedElementIds.push(retryExisting.id);
                        await logElementChange({
                          projectElementId: retryExisting.id,
                          oldValue: retryExisting.value || null,
                          newValue: row.value || null,
                          changedBy: userId,
                          changeSource: "solomon",
                        });
                      }
                    } else {
                      throw perErr;
                    }
                  }
                }
              } else {
                throw insertErr;
              }
            }
          }

          // 1. Validate each modified element
          for (const elementId of modifiedElementIds) {
            try {
              const validation = await validateElement(elementId, projectId);
              await db.update(projectElements).set({
                validationStatus: validation.status,
                validationDetails: validation.details,
              }).where(eq(projectElements.id, elementId));

              // SSE per element — resolve label from elementDefinitions or templateElements
              const pe = await db.query.projectElements.findFirst({ where: eq(projectElements.id, elementId) });
              let elementKey = "";
              let elementLabel = "";
              if (pe?.elementDefId) {
                const ed = orgElemDefs.find(d => d.id === pe.elementDefId);
                if (ed) { elementKey = ed.elementKey; elementLabel = ed.displayName || ed.elementKey; }
              }
              if (!elementKey && pe?.templateElementId) {
                const te = orgTmplEls.find(t => t.id === pe.templateElementId);
                if (te) { elementKey = te.key; elementLabel = te.label || te.key; }
              }
              if (pe && elementKey) {
                publishElementValidated(projectId, {
                  elementId,
                  elementKey,
                  value: pe.value,
                  validationStatus: validation.status,
                  message: `Element "${elementLabel}" → ${validation.status}`,
                }).catch((e: any) => console.warn("[solomon] SSE element_validated:", e.message));
              }
            } catch (err) {
              console.error(`[solomon] Validation failed for element ${elementId}:`, err);
            }
          }

          // 2. Re-check eligibility
          if (modifiedElementIds.length > 0) {
            try {
              await checkEligibility(projectId, organizationId);
              const eligibility = await db.query.projectEligibility.findMany({
                where: eq(projectEligibility.projectId, projectId),
              });
              publishEligibilityUpdated(projectId, {
                total: eligibility.length,
                passed: eligibility.filter(e => e.status === "passed").length,
                failed: eligibility.filter(e => e.status === "failed").length,
                pending: eligibility.filter(e => e.status === "pending").length,
                message: `Eligibilitate re-evaluată: ${eligibility.filter(e => e.status === "passed").length}/${eligibility.length} trecute`,
              }).catch((e: any) => console.warn("[solomon] SSE eligibility_updated:", e.message));
            } catch (err) {
              console.error(`[solomon] Eligibility check failed for project ${projectId}:`, err);
            }

            // 3. Recompute scoring
            try {
              const scoreResult = await computeProjectScores(projectId);
              if (scoreResult.scores.length > 0) {
                publishScoreUpdated(projectId, {
                  totalPoints: scoreResult.totalPoints,
                  maxTotalPoints: scoreResult.maxTotalPoints,
                  percentage: scoreResult.percentage,
                  message: `Punctaj actualizat: ${scoreResult.totalPoints}/${scoreResult.maxTotalPoints} (${scoreResult.percentage}%)`,
                }).catch((e: any) => console.warn("[solomon] SSE score_updated:", e.message));
              }
            } catch (err) {
              console.error(`[solomon] Score computation failed for project ${projectId}:`, err);
            }
          }

          // Sync tip_proiect element → projects.tipProiect column
          const tipProiectEl = extractedElements.find(el => el.key === "tip_proiect");
          if (tipProiectEl?.value) {
            await db.update(projects).set({ tipProiect: tipProiectEl.value, updatedAt: new Date() }).where(eq(projects.id, projectId));
          }

          // Send extraction event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "elements_extracted",
            elements: extractedElements,
          })}\n\n`));
        }

        // Extract project metadata (program, nomenclator, prefix, structure)
        // Only allow known keys with bounded values to prevent injection
        const metadataMatch = fullResponse.match(/<!--METADATA_JSON(\{[\s\S]*?\})METADATA_JSON-->/);
        if (metadataMatch) {
          try {
            const rawMetadata = JSON.parse(metadataMatch[1]);
            if (rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)) {
              const metaUpdate: any = { updatedAt: new Date() };
              const validatedMetadata: Record<string, string> = {};

              for (const [key, value] of Object.entries(rawMetadata)) {
                if (ALLOWED_METADATA_KEYS.has(key) && typeof value === "string" && value.length <= MAX_METADATA_VALUE_LENGTH) {
                  metaUpdate[key] = value;
                  validatedMetadata[key] = value;
                }
              }

              if (Object.keys(metaUpdate).length > 1) {
                await db.update(projects).set(metaUpdate).where(eq(projects.id, projectId));

                // Notify frontend about metadata update
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: "metadata_updated",
                  metadata: validatedMetadata,
                })}\n\n`));
              }
            }
          } catch {}
        }

        // Save assistant message (clean hidden JSON tags)
        const cleanResponse = fullResponse
          .replace(/<!--ELEMENTS_JSON\[[\s\S]*?\]ELEMENTS_JSON-->/g, "")
          .replace(/<!--METADATA_JSON\{[\s\S]*?\}METADATA_JSON-->/g, "")
          .trim();

        await db.insert(solomonMessages).values({
          conversationId,
          role: "assistant",
          content: cleanResponse,
          elementsExtracted: extractedElements.length > 0 ? JSON.stringify(extractedElements) : null,
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
          action: "chat",
        });

        clearTimeout(streamTimeout);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (error) {
        clearTimeout(streamTimeout);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`));
        controller.close();
      }
    },
  });
}
