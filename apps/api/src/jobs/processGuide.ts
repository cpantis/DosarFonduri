import { Worker, Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { documents, rules, orgConfig } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent } from "../lib/sse";
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

      await job.updateProgress(30);
      await extractFixedRules(text, fixedModel, documentId, organizationId);

      await job.updateProgress(60);
      await extractInterpretedRules(text, interpModel, useET, documentId, organizationId);

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
      console.error("Process guide error:", error);
      await db.update(documents).set({ status: "error" }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: "error",
        message: `Eroare la procesarea ghidului: ${error instanceof Error ? error.message : "Eroare necunoscută"}`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
