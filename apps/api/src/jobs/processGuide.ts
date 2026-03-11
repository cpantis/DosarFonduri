import { Worker, Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { documents, rules, orgConfig, scoringCriteria } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishJobProgress } from "../lib/sse";
import { redis, isRedisReady } from "../lib/redis";

const anthropic = new Anthropic();

/** Cache guide text in Redis for reuse by Solomon/Neemia (TTL 30 days) */
async function cacheGuideText(documentId: string, text: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.set(`guide_text:${documentId}`, text, "EX", 30 * 86400); // 30 days TTL
  } catch (err) {
    console.warn("Failed to cache guide text:", err);
  }
}

interface ProcessGuidePayload {
  documentId: string;
  organizationId: string;
}

async function extractFixedRules(
  text: string,
  model: string,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: `Esti Solomon — expert in pregatirea si conformitatea proiectelor cu finantare europeana, cu cunostinte integrate de achizitii publice, eligibilitate cheltuieli, specificatii tehnice si cerinte documentare per program.

Analizezi ghiduri de finantare si extragi REGULI FIXE — conditii binare, verificabile automat cu date din certificat constatator, bilant sau alte surse oficiale.

REGULI FIXE = conditii cu raspuns DA/NU:
- Plafoane numerice (cifra afaceri min/max, angajati min, capital social min)
- Forme juridice eligibile/neeligibile
- Coduri CAEN eligibile (inclusiv conditia de autorizare la ONRC)
- Vechime minima firma (ani de la infiintare)
- Zone geografice eligibile (judete, UAT-uri, urban/rural)
- Dimensiune ferma (SO minim/maxim)
- Valoare investitie min/max
- Cofinantare minima (%)
- Restrictii stare firma (nu in insolventa, nu radiata, nu in dificultate)

ACHIZITII — cauta reguli fixe despre:
- Praguri valorice pentru proceduri de achizitie (achizitie directa / procedura simplificata / licitatie)
- Numar minim de oferte comparative obligatorii
- Obligativitate SEAP/SICAP peste anumite praguri
- Interdictii (ex: echipamente second-hand, leasing operational)

ELIGIBILITATE CHELTUIELI — cauta reguli fixe despre:
- Categorii de cheltuieli eligibile/neeligibile explicit mentionate
- Plafoane pe categorii (% din valoarea proiectului, sume absolute)
- TVA eligibil/neeligibil
- Cheltuieli indirecte (flat rate % sau cost real)
- Intensitatea ajutorului per dimensiune firma (micro/mica/mijlocie/mare)
- Durata minima de utilizare / pastrare a activelor achizitionate

DOCUMENTE OBLIGATORII — cauta reguli fixe despre:
- Lista documentelor obligatorii la depunere
- Formate impuse (original, copie, electronic)
- Termen de valabilitate documente (ex: certificat fiscal max 30 zile)
- Documente conditionate de tipul investitiei

Fii EXHAUSTIV — o regula omisa poate insemna un dosar respins.
Returneaza DOAR JSON valid — array de obiecte. Fara backticks, fara explicatii.`,
    messages: [{
      role: "user",
      content: `Extrage TOATE regulile fixe din acest ghid de finantare.

Pentru fiecare regula returneaza:
{
  "category": "eligibilitate" | "financiar" | "tehnic" | "administrativ" | "achizitii" | "documente",
  "description": "Descriere clara a regulii",
  "condition": {
    "field": "campul verificat (ex: cifra_afaceri, forma_juridica, cod_caen, angajati, vechime_ani)",
    "operator": "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "between",
    "value": "valoarea de comparare",
    "value2": "pentru between - limita superioara (optional)"
  },
  "source_page": number,
  "source_text": "textul exact din ghid care defineste regula",
  "confidence": 0.0 - 1.0
}

TEXT GHID:
${text.slice(0, 100000)}`
    }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse fixed rules JSON");
    parsed = [];
  }

  if (parsed.length > 0) {
    await db.insert(rules).values(
      parsed.map((r: any) => ({
        documentId,
        organizationId,
        type: "fixed" as const,
        category: r.category || "eligibilitate",
        description: r.description,
        condition: r.condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: r.confidence?.toString() || "0.90",
      }))
    );
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_fixed_rules",
  });
}

async function extractInterpretedRules(
  text: string,
  model: string,
  useET: boolean,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Extrage REGULILE INTERPRETATE din acest ghid de finantare — reguli care necesita judecata, arbori decizionali, sau context suplimentar.

REGULI INTERPRETATE = conditii complexe:
- Intensitatea sprijinului (% finantare nerambursabila) bazata pe mai multi factori
- Criterii de selectie cu punctaje (grile de punctare)
- Conditii cumulative (trebuie indeplinite toate din lista)
- Exceptii si cazuri speciale
- Definitii interpretabile (ex: "exploatatie agricola viabila", "intreprindere in dificultate")
- Cerinte documentare conditionate (documentul X e necesar doar daca...)
- Restrictii temporale complexe (ex: "in ultimii 3 ani fiscali")
- Reguli de achizitii conditionate de valoare, tip beneficiar sau tip cheltuiala
- Cheltuieli eligibile conditionat (doar cu justificare, doar pana la un plafon calculat)
- Reguli privind ajutorul de stat / de minimis — cumul, verificare, declaratii

Pentru fiecare regula returneaza:
{
  "category": "selectie" | "intensitate" | "eligibilitate_complexa" | "documentare" | "achizitii" | "ajutor_stat",
  "description": "Descriere detaliata",
  "condition": {
    "type": "decision_tree" | "scoring" | "cumulative" | "conditional",
    "logic": "descriere structurata a logicii decizionale",
    "factors": ["factor1", "factor2"],
    "outcomes": [{"if": "conditie", "then": "rezultat"}]
  },
  "source_page": number,
  "source_text": "textul exact din ghid",
  "confidence": 0.0 - 1.0,
  "needs_review": true/false,
  "review_reason": "de ce necesita verificare umana"
}

TEXT GHID:
${text.slice(0, 100000)}`
  }];

  const requestParams: any = {
    model,
    max_tokens: 12000,
    system: `Esti Solomon — expert in pregatirea si conformitatea proiectelor cu finantare europeana, cu cunostinte integrate de achizitii publice, eligibilitate cheltuieli, specificatii tehnice si cerinte documentare per program.

Analizezi ghiduri de finantare si extragi REGULI INTERPRETATE — reguli complexe care necesita arbori decizionali, judecata profesionala sau context suplimentar.

ACHIZITII — cauta reguli interpretate despre:
- Cand se aplica procedura simplificata vs licitatie (praguri cumulate, loturi)
- Criterii de atribuire complexe (pret + calitate, ponderi)
- Conflict de interese — definitii si situatii care necesita declaratii
- Specificatii tehnice care ar putea fi considerate restrictive
- Reguli de proportionalitate intre valoare achizitie si complexitate procedura

ELIGIBILITATE CHELTUIELI — cauta reguli interpretate despre:
- Cheltuieli eligibile conditionat (ex: "doar daca se justifica prin SF")
- Reguli de rezonabilitate a preturilor (studiu de piata, benchmarking)
- Cheltuieli cu personalul — conditii complexe (% din buget, categorii, nivel salarial)
- Reguli de amortizare si pro-rata temporis
- Dubla finantare — cum se verifica, ce constitue suprapunere

SELECTIE SI PUNCTAJ — cauta:
- Grile complete de evaluare cu punctaje si praguri minime
- Criterii cu subpuncte conditionate
- Bonificatii si penalizari

CERINTE DOCUMENTARE COMPLEXE — cauta:
- Documente necesare doar in anumite scenarii (tip investitie, locatie, dimensiune)
- Formate specifice organismului (AFIR, ADR, MIPE) cu codificari
- Termene de depunere / completare / clarificari
- Conditii de conformitate administrativa vs eligibilitate tehnica

Fii EXHAUSTIV — o regula ratata poate insemna un dosar respins.
Marcheaza cu needs_review: true regulile unde ai dubii.
Returneaza DOAR JSON valid — array de obiecte.`,
    messages,
  };

  if (useET) {
    requestParams.thinking = {
      type: "enabled",
      budget_tokens: 10000,
    };
  }

  const response = await anthropic.messages.create(requestParams);

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? (textBlock as any).text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse interpreted rules JSON");
    parsed = [];
  }

  if (parsed.length > 0) {
    await db.insert(rules).values(
      parsed.map((r: any) => ({
        documentId,
        organizationId,
        type: "interpreted" as const,
        category: r.category || "selectie",
        description: r.description,
        condition: r.condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: r.confidence?.toString() || "0.75",
        validated: false,
      }))
    );
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_interpreted_rules",
  });
}

/** Phase 3: Extract scoring grid → scoringCriteria table */
async function extractScoringCriteria(
  text: string,
  model: string,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: `Esti Solomon — expert in finantari europene.

Extragi GRILA DE PUNCTAJ / CRITERII DE SELECTIE din ghiduri de finantare.
Acestea sunt criteriile prin care se IERARHIZEAZA / PUNCTEAZA proiectele depuse.

Fiecare criteriu are:
- Un cod/numar (ex: CS1, C1, 1.1)
- Un nume descriptiv
- Punctaj maxim
- O modalitate de evaluare: lookup (tabel), range (interval numeric), boolean (da/nu), formula

IMPORTANT:
- Extrage TOATE criteriile din grila de punctaj/selectie
- Pentru fiecare criteriu, identifica tipul de evaluare si structura logicii
- Daca criteriul se evalueaza pe baza unui tabel (ex: "conform Anexa X"), tipul este "lookup"
- Daca criteriul depinde de un interval numeric (ex: "1-5 angajati = 10p, 6-10 = 20p"), tipul este "range"
- Daca criteriul este da/nu, tipul este "boolean"
- Daca criteriul necesita o formula de calcul, tipul este "formula"
- Identifica cheia elementului (field/camp) pe care se bazeaza evaluarea

Returneaza DOAR JSON valid — array de obiecte. Fara backticks, fara explicatii.`,
    messages: [{
      role: "user",
      content: `Extrage grila de punctaj / criteriile de selectie din acest ghid.

Pentru fiecare criteriu returneaza:
{
  "code": "codul criteriului (ex: CS1, C1, 1.1)",
  "name": "numele criteriului",
  "description": "descriere detaliata a criteriului si cum se acorda punctele",
  "maxPoints": number,
  "category": "categoria (ex: tehnic, financiar, management, relevant, sustenabilitate)",
  "sourcePage": number | null,
  "evaluationLogic": {
    "type": "lookup" | "range" | "boolean" | "formula",
    "elementKey": "cheia campului de evaluat (ex: numar_angajati, cifra_afaceri, experienta_ani)",
    "ranges": [{"min": number, "max": number, "points": number}] // doar pt type=range
    "formula": "expresie matematica cu {element_key}" // doar pt type=formula
    "lookupColumn": "coloana punctaj din tabel" // doar pt type=lookup
  }
}

Daca nu gasesti nicio grila de punctaj, returneaza un array gol [].

TEXT GHID:
${text.slice(0, 100000)}`
    }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse scoring criteria JSON");
    parsed = [];
  }

  if (parsed.length > 0) {
    // Remove existing criteria for this document before inserting
    await db.delete(scoringCriteria).where(eq(scoringCriteria.documentId, documentId));

    await db.insert(scoringCriteria).values(
      parsed.map((c: any, idx: number) => ({
        documentId,
        organizationId,
        code: c.code || `CS${idx + 1}`,
        name: c.name || "Criteriu neprecizat",
        description: c.description || null,
        maxPoints: String(c.maxPoints || 0),
        evaluationLogic: c.evaluationLogic || null,
        category: c.category || null,
        sortOrder: idx,
        sourcePage: c.sourcePage || null,
      }))
    );
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_scoring_criteria",
  });
}

export const processGuideWorker = new Worker<ProcessGuidePayload>(
  "process-guide",
  async (job: Job<ProcessGuidePayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      let text = "";
      if (doc.fileType === "pdf") {
        text = await extractTextFromPDF(buffer);
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else {
        throw new Error(`Format nesuportat pentru ghid: ${doc.fileType}`);
      }

      // Cache guide text in Redis for reuse by Solomon/Neemia
      cacheGuideText(documentId, text).catch(() => {});

      const config = await db.query.orgConfig.findFirst({
        where: eq(orgConfig.organizationId, organizationId),
      });

      const fixedModel = config?.reguliFixeModel || "claude-sonnet-4-20250514";
      const interpModel = config?.reguliInterpModel || "claude-opus-4-6";
      const useET = config?.reguliInterpET ?? true;

      await job.updateProgress(25);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 25,
        status: "processing",
        message: `Extragere reguli fixe din "${doc.name}"...`,
      }).catch(() => {});
      await extractFixedRules(text, fixedModel, documentId, organizationId);

      await job.updateProgress(50);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 50,
        status: "processing",
        message: `Extragere reguli interpretate din "${doc.name}"...`,
      }).catch(() => {});
      await extractInterpretedRules(text, interpModel, useET, documentId, organizationId);

      await job.updateProgress(75);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 75,
        status: "processing",
        message: `Extragere grilă punctaj din "${doc.name}"...`,
      }).catch(() => {});
      await extractScoringCriteria(text, fixedModel, documentId, organizationId);

      const pageCount = (text.match(/--- Pagina/g) || []).length;
      await db.update(documents).set({
        status: "processed",
        pageCount,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      // SSE notification
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "ghid",
        pageCount,
        message: `Ghid procesat "${doc.name}". ${pageCount} pagini, reguli extrase.`,
      }).catch(() => {});
    } catch (error) {
      console.error(`Process guide error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

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
          ? `Eroare la procesarea ghidului (toate ${job.opts.attempts || 3} încercări eșuate): ${error instanceof Error ? error.message : "Eroare necunoscută"}`
          : `Eroare la procesarea ghidului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă): ${error instanceof Error ? error.message : "Eroare necunoscută"}`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
