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

  // Get failed eligibility rules
  const eligResults = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, projectId),
  });
  const allRules = await db.query.rules.findMany({
    where: eq(rules.organizationId, organizationId),
  });
  const rulesMap = new Map(allRules.map(r => [r.id, r]));

  const failedRules = eligResults
    .filter(e => e.status === "failed")
    .map(e => {
      const rule = rulesMap.get(e.ruleId);
      return rule ? `- ⚠️ ${rule.description}` : null;
    })
    .filter(Boolean);

  // Company financials
  const latestFinancial = await db.query.companyFinancials.findFirst({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  return `Ești Solomon, agentul AI al platformei DosarFonduri. Ajuți consultantul să completeze dosarul de finanțare "${project.name}" pentru firma "${company.denumire}" (CUI: ${company.cui}).

## ROLUL TĂU
- Colectezi date inteligent din conversație și din documentele uploadate
- Extragi informații relevante pentru câmpurile necompletate
- Prelucrezi datele conform regulilor din ghidul de finanțare
- Ești proactiv: întrebi despre câmpurile lipsă, sugerezi ce documente mai sunt necesare
- Răspunzi în română, profesional dar accesibil

## DATE FIRMĂ (din ONRC)
- Denumire: ${company.denumire}
- CUI: ${company.cui}
- Forma juridică: ${company.formaJuridica}
- CAEN: ${company.caen || "nespecificat"}
- Adresă: ${company.adresa}, ${company.judet}
- Angajați: ${(latestFinancial?.f30 as any)?.numarMediuSalariati || "necunoscut"}
- Cifra afaceri: ${(latestFinancial?.f20 as any)?.cifraAfaceriNeta || "necunoscut"} RON
- An înființare: ${company.anInfiintare || "necunoscut"}

## CÂMPURI DE COMPLETAT (${emptyElements.length} rămase)
${emptyElements.length > 0 ? emptyElements.join("\n") : "Toate câmpurile sunt completate!"}

## CÂMPURI DEJA COMPLETATE (${filledElements.length})
${filledElements.length > 0 ? filledElements.slice(0, 20).join("\n") : "Niciun câmp completat încă."}
${filledElements.length > 20 ? `\n... și alte ${filledElements.length - 20} câmpuri` : ""}

${failedRules.length > 0 ? `## ATENȚIE — REGULI NEÎNDEPLINITE
${failedRules.join("\n")}` : ""}

## INSTRUCȚIUNI
1. Când consultantul uploadează un document (CI, CV, atestat, ofertă), extrage automat informațiile relevante
2. Când primești text liber, identifică ce câmpuri poate completa
3. Prelucrează datele conform regulilor ghidului (ex: calculează cofinanțare, verifică eligibilitate)
4. După fiecare extragere, confirmă ce câmpuri ai completat și ce mai lipsește
5. Dacă nu poți extrage o informație, întreabă direct
6. IMPORTANT: returnează câmpurile extrase în format JSON la sfârșitul mesajului:
   <!--ELEMENTS_JSON[{"key": "camp", "value": "valoare", "confidence": 0.95}]ELEMENTS_JSON-->`;
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
    system: "Ești Solomon, un asistent AI. Rescrie fragmentul selectat conform instrucțiunii utilizatorului. Returnează DOAR textul rescris, fără explicații suplimentare.",
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
          cost: ((tokensIn * 15 / 1_000_000) + (tokensOut * 75 / 1_000_000)).toFixed(6),
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
    max_tokens: 4000,
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
        const elementsMatch = fullResponse.match(/<!--ELEMENTS_JSON\[(.*?)\]ELEMENTS_JSON-->/s);
        let extractedElements: any[] = [];
        if (elementsMatch) {
          try {
            extractedElements = JSON.parse(`[${elementsMatch[1]}]`);
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
        const cleanResponse = fullResponse.replace(/<!--ELEMENTS_JSON\[.*?\]ELEMENTS_JSON-->/s, "").trim();

        await db.insert(solomonMessages).values({
          conversationId,
          role: "assistant",
          content: cleanResponse,
          elementsExtracted: extractedElements.length > 0 ? JSON.stringify(extractedElements) : null,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          cost: ((tokensIn * 15 / 1_000_000) + (tokensOut * 75 / 1_000_000)).toFixed(6),
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
