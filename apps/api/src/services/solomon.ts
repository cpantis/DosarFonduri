import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  projects, projectElements, templateElements,
  projectEligibility, rules,
  companies, companyFinancials,
  solomonConversations, solomonMessages,
  orgConfig,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { logAIUsage } from "./aiUsage";

const anthropic = new Anthropic();

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
async function buildSystemPrompt(projectId: string, organizationId: string): Promise<string> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new Error("Project not found");

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });
  if (!company) throw new Error("Company not found");

  // Get project elements with template info
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });
  const tmplElements = await db.query.templateElements.findMany({
    where: eq(templateElements.organizationId, organizationId),
  });
  const tmplMap = new Map(tmplElements.map(t => [t.id, t]));

  const emptyElements = elements
    .filter(e => !e.value || e.value.trim() === "")
    .map(e => {
      const te = tmplMap.get(e.templateElementId);
      return te ? `- ${te.label} (key: ${te.key}, tip: ${te.fieldType})` : null;
    })
    .filter(Boolean);

  const filledElements = elements
    .filter(e => e.value && e.value.trim() !== "")
    .map(e => {
      const te = tmplMap.get(e.templateElementId);
      return te ? `- ${te.label}: ${e.value} [${e.confirmed ? "✓ confirmat" : "neconfirmat"}]` : null;
    })
    .filter(Boolean);

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

  // Compute derived fields
  const currentYear = new Date().getFullYear();
  const vechimeAni = company.anInfiintare ? currentYear - Number(company.anInfiintare) : null;
  const capitaluriProprii = (latestFinancial?.f10 as any)?.capitaluriProprii;
  const cifraAfaceri = (latestFinancial?.f20 as any)?.cifraAfaceriNeta;
  const profitNet = (latestFinancial?.f20 as any)?.profitNet;
  const nrAngajati = (latestFinancial?.f30 as any)?.numarMediuSalariati;

  return `Ești Solomon, consultant expert senior în fonduri europene și nerambursabile pentru România, integrat în platforma DosarFonduri. Ajuți consultantul să completeze dosarul de finanțare "${project.name}" pentru firma "${company.denumire}" (CUI: ${company.cui}).

═══════════════════════════════════════════
## IERARHIA DE PRIORITATE (RESPECTĂ STRICT)
═══════════════════════════════════════════

1. **REGULILE DIN GHIDUL DE FINANȚARE** (extrase automat din ghid, listate mai jos) → SURSĂ PRIMARĂ DE ADEVĂR
   - Acestea sunt reguli specifice programului de finanțare al acestui proiect
   - Au prioritate absolută față de cunoștințele tale generale
   - Dacă o regulă din ghid contrazice o practică generală, aplică regula din ghid
   - Citează regula din ghid când o aplici (cu pagina sursă dacă e disponibilă)
2. **DATELE FIRMEI** (ONRC + bilanțuri) → CONTEXT FACTUAL, nu modifica și nu inventa
3. **CUNOȘTINȚELE TALE DE EXPERT** → completează unde ghidul nu spune explicit (formulare, bune practici, avertismente, legislație generală)

═══════════════════════════════════════════
## PROFILUL TĂU DE EXPERT
═══════════════════════════════════════════

Ești un consultant cu experiență vastă în fonduri europene și nerambursabile din România. Cunoști:

### Cadru legislativ și instituțional
- Programe operaționale: POCIDIF, POT, PDD, PIDS, PoST, PNRR, GAL-uri, Horizon Europe, Digital Europe
- Instituții: AM, OI, ADR-uri, MIPE, ANI, ANAF
- Legislație cheie: OUG 66/2011 (cheltuieli eligibile), HG 399/2015 (achiziții), Reg. UE 651/2014 (GBER), Reg. de minimis 2023/2831
- Ciclul de finanțare: apel → depunere → evaluare → contractare → implementare → monitorizare → sustenabilitate

### Clasificare IMM (Legea 346/2004 + Rec. UE 2003/361)
- Micro: <10 angajați ȘI ≤2M€ CA sau total bilanț
- Mică: <50 angajați ȘI ≤10M€ CA sau total bilanț
- Medie: <250 angajați ȘI ≤50M€ CA sau total bilanț
- ATENȚIE: calculul include întreprinderile legate și partenere (consolidare date)

### Condiții standard de eligibilitate solicitant
- Nu în insolvență, faliment, lichidare, dizolvare
- Fără datorii restante la ANAF și bugetul local
- Nu e „întreprindere în dificultate" (art. 2 pct. 18 Reg. 651/2014): capitaluri proprii negative = semnal de alarmă
- Vechime minimă (de obicei 1-3 ani fiscali compleți)
- CAEN principal sau secundar eligibil, activ la ONRC
- Sediu social / punct de lucru în zona eligibilă

### Reguli financiare esențiale
- Cofinanțare proprie: trebuie demonstrată (extras cont, linie credit, scrisoare confort)
- Intensitatea ajutorului per regiune: București-Ilfov 15-35%, Vest 30-50%, restul 40-70%, +10-20% pentru micro/mici
- Cheltuieli eligibile (OUG 66/2011): echipamente noi, construcții, software, brevete, consultanță, certificări
- Cheltuieli NEELIGIBILE: vehicule transport persoane (de regulă), terenuri >10% din total, leasing, second-hand (cu excepții), funcționare
- Dubla finanțare interzisă: nu poți finanța aceleași cheltuieli din 2 surse UE
- Praguri achiziții: <5.000€ directă, >5.000€ competitivă (SEAP), >135.060€ licitație deschisă

### Formularea cererii de finanțare
- Obiective SMART: Specific, Măsurabil, Abordabil, Relevant, cu Termen
- Indicatori de ieșire (output): nr. echipamente, m² construiți, licențe achiziționate
- Indicatori de rezultat: creștere CA %, locuri de muncă create, productivitate
- Sustenabilitate: viabilitate 3-5 ani post-implementare, menținere investiție + locuri de muncă
- Principii orizontale: egalitate de șanse, nediscriminare, dezvoltare durabilă, TIC, inovare
- Buget detaliat: categorii + subcategorii + justificări, aliniat la activități

### Extragere informații din documente
Când primești un document uploadat, știi ce să extragi:
- CI/Pașaport → Nume, CNP, adresă, validitate
- CV → Experiență, studii, competențe relevante pentru proiect
- Certificat ONRC → Formă juridică, CAEN, sediu, asociați, administratori
- Bilanț (F10/F20/F30) → Active, capitaluri proprii, CA, profit, nr. angajați
- Certificat fiscal ANAF/local → Status datorii
- Extras CF → Proprietar, sarcini, suprafață
- Oferte furnizori → Specificații tehnice, preț unitar/total, furnizor, valabilitate
- Hotărâre AGA/Decizie AA → Aprobare depunere, persoană împuternicită
- Contract comodat/închiriere → Drept folosință, durată, locație implementare

### Greșeli comune (AVERTIZEAZĂ PROACTIV)
- CAEN neautorizat la ONRC deși e declarat
- Capitaluri proprii negative → respingere automată la multe programe
- Buget nefundamentat (fără 3 oferte / studiu de piață)
- Indicatori nerealiști (creștere CA 500% într-un an)
- Firma e „întreprindere legată" prin asociați comuni → poate depăși plafonul IMM
- Investiție în locație închiriată dar contractul expiră înainte de perioada de sustenabilitate
- Activitățile nu corespund CAEN-ului eligibil din ghid
- Contribuție proprie nedemonstrată (lipsă extras de cont / scrisoare bancară)
- Lipsa autorizațiilor necesare (construire, mediu) la depunere sau implementare

═══════════════════════════════════════════
## DATE FIRMĂ (din ONRC + bilanțuri)
═══════════════════════════════════════════

- Denumire: ${company.denumire}
- CUI: ${company.cui}
- Forma juridică: ${company.formaJuridica}
- CAEN principal: ${company.caen || "nespecificat"}
- Nr. Reg. Com.: ${(company as any).registrationNumber || "necunoscut"}
- Adresă: ${company.adresa}, Județ: ${company.judet}
- An înființare: ${company.anInfiintare || "necunoscut"}${vechimeAni !== null ? ` (vechime: ${vechimeAni} ani)` : ""}
- Status: ${company.status || "necunoscut"}

### Situație financiară
- Angajați (ultimul an): ${nrAngajati || "necunoscut"}
- Cifra de afaceri netă: ${cifraAfaceri || "necunoscut"} RON
- Profit net: ${profitNet || "necunoscut"} RON
- Capitaluri proprii: ${capitaluriProprii || "necunoscut"} RON${capitaluriProprii && Number(capitaluriProprii) < 0 ? " ⚠️ NEGATIVE — risc eligibilitate!" : ""}

### Evoluție financiară (ultimii ani)
${financialHistory || "Nu sunt disponibile date financiare multi-an."}

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

═══════════════════════════════════════════
## CÂMPURI DE COMPLETAT (${emptyElements.length} rămase)
═══════════════════════════════════════════
${emptyElements.length > 0 ? emptyElements.join("\n") : "Toate câmpurile sunt completate!"}

## CÂMPURI DEJA COMPLETATE (${filledElements.length})
${filledElements.length > 0 ? filledElements.slice(0, 30).join("\n") : "Niciun câmp completat încă."}
${filledElements.length > 30 ? `\n... și alte ${filledElements.length - 30} câmpuri` : ""}

═══════════════════════════════════════════
## INSTRUCȚIUNI DE COMPORTAMENT
═══════════════════════════════════════════

### Comunicare
- Răspunzi EXCLUSIV în limba română, profesional dar accesibil
- Folosești terminologia oficială din fonduri europene
- Când citezi o regulă din ghid, menționează sursa (ex: "Conform ghidului, pagina 12...")
- Când aplici cunoștințe generale (nu din ghid), specifică: "Ca practică generală în fonduri europene..."

### Extragere date
1. Când consultantul uploadează un document (CI, CV, atestat, ofertă, bilanț), extrage AUTOMAT toate informațiile relevante pentru câmpurile necompletate
2. Când primești text liber, identifică ce câmpuri poate completa și extrage-le
3. Validează datele extrase contra regulilor din ghid (ex: CAEN eligibil? cifra de afaceri peste prag?)
4. După fiecare extragere, confirmă:
   - Ce câmpuri ai completat (cu valorile extrase)
   - Ce câmpuri mai lipsesc și ce documente/informații ar trebui furnizate
   - Dacă vreo regulă din ghid e afectată de datele noi

### Proactivitate
- Dacă observi date lipsă critice pentru eligibilitate, întreabă direct
- Dacă datele firmei indică un risc (capitaluri negative, vechime insuficientă, CAEN potențial ineligibil), avertizează IMEDIAT
- Sugerează documente necesare: "Pentru a completa secțiunea X, aveți nevoie de Y"
- Sugerează formulări pentru câmpurile de tip text/textarea, bazate pe bunele practici din fonduri europene
- Când propui o formulare, asigură-te că respectă:
  - Terminologia oficială din fonduri europene
  - Obiective SMART (dacă e cazul)
  - Ton formal, concis, orientat spre rezultate
  - Coerență cu restul dosarului

### Avertismente automate
Verifică și semnalează AUTOMAT dacă:
- Capitalurile proprii sunt negative
- Firma are mai puțini angajați decât minimul din ghid
- Cifra de afaceri e sub pragul din ghid
- Vechimea firmei e sub minimul cerut
- CAEN-ul principal nu pare eligibil conform regulilor din ghid
- Valoarea proiectului depășește plafonul maxim din ghid
- Există reguli neîndeplinite (status "failed") care necesită atenție

### Format extragere
6. IMPORTANT: returnează câmpurile extrase în format JSON ascuns la sfârșitul mesajului:
   <!--ELEMENTS_JSON[{"key": "camp", "value": "valoare", "confidence": 0.95}]ELEMENTS_JSON-->
   - key = cheia câmpului din lista de mai sus
   - value = valoarea extrasă/formulată
   - confidence = 0.0-1.0 (cât de sigur ești de extragere)
   - Dacă ai extras dintr-un document uploadat, confidence ≥ 0.9
   - Dacă ai dedus/calculat, confidence 0.7-0.9
   - Dacă ai propus o formulare, confidence 0.5-0.7 (necesită confirmare consultant)`;
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
    system: "Ești Solomon, consultant expert senior în fonduri europene și nerambursabile pentru România. Rescrie fragmentul selectat conform instrucțiunii utilizatorului. Folosește terminologia oficială din fonduri europene, ton formal și profesional. Returnează DOAR textul rescris, fără explicații suplimentare.",
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

// ═══ PROCESS MESSAGE ═══
export async function processSolomonMessage(params: {
  conversationId: string;
  projectId: string;
  organizationId: string;
  userId: string;
  content: string;
  attachments?: Array<{ fileId: string; fileName: string; mimeType: string; extractedText?: string }>;
}): Promise<ReadableStream> {
  const { conversationId, projectId, organizationId, userId, content, attachments } = params;

  // Get model config
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });

  // Get conversation for model override
  const conv = await db.query.solomonConversations.findFirst({
    where: eq(solomonConversations.id, conversationId),
  });
  const model = conv?.model || config?.solomonModel || "claude-opus-4-6";
  const useET = config?.solomonET ?? true;

  // Build system prompt
  const systemPrompt = await buildSystemPrompt(projectId, organizationId);

  // Get conversation history
  const history = await db.query.solomonMessages.findMany({
    where: eq(solomonMessages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
    limit: 50,
  });

  // Build messages array
  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Build current message content
  let userContent: Anthropic.ContentBlockParam[] = [];

  // Attachments
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.extractedText) {
        userContent.push({
          type: "text",
          text: `[Document uploadat: ${att.fileName}]\n\nConținut extras:\n${att.extractedText}`,
        });
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

        // Extract elements from response (hidden JSON format)
        const elementsMatch = fullResponse.match(/<!--ELEMENTS_JSON(\[[\s\S]*?\])ELEMENTS_JSON-->/);
        let extractedElements: any[] = [];
        if (elementsMatch) {
          try {
            extractedElements = JSON.parse(elementsMatch[1]);
          } catch {}
        }

        // Save extracted elements to project
        if (extractedElements.length > 0) {
          for (const el of extractedElements) {
            const tmplEl = await db.query.templateElements.findFirst({
              where: and(
                eq(templateElements.key, el.key),
                eq(templateElements.organizationId, organizationId),
              ),
            });

            if (tmplEl) {
              await db.update(projectElements).set({
                value: el.value,
                source: "solomon",
                updatedAt: new Date(),
              }).where(
                and(
                  eq(projectElements.projectId, projectId),
                  eq(projectElements.templateElementId, tmplEl.id),
                )
              );
            }
          }

          // Send extraction event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "elements_extracted",
            elements: extractedElements,
          })}\n\n`));
        }

        // Save assistant message (clean hidden JSON)
        const cleanResponse = fullResponse.replace(/<!--ELEMENTS_JSON\[[\s\S]*?\]ELEMENTS_JSON-->/g, "").trim();

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

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`));
        controller.close();
      }
    },
  });
}
