# FAZA 5 — Solomon (Agent Chat AI)
## Chat Conversațional, Upload Documente, Extragere Automată Elemente

**Dependențe**: Faza 4 completă (Proiecte, Elemente)

---

## 5.1 SERVICE SOLOMON

```typescript
// apps/api/src/services/solomon.ts
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import {
  projects, projectElements, templateElements, rules,
  companies, companyFinancials, solomonConversations, solomonMessages,
  orgConfig,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { logAIUsage } from "./aiUsage";

const anthropic = new Anthropic();

// ═══ CONSTRUIRE SYSTEM PROMPT ═══
async function buildSystemPrompt(projectId: string, organizationId: string): Promise<string> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { company: true },
  });
  if (!project) throw new Error("Project not found");

  // Preia elemente necompletate
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
    with: { templateElement: true },
  });

  const emptyElements = elements
    .filter(e => !e.value || e.value.trim() === "")
    .map(e => `- ${e.templateElement?.label} (key: ${e.templateElement?.key}, tip: ${e.templateElement?.fieldType})`);

  const filledElements = elements
    .filter(e => e.value && e.value.trim() !== "")
    .map(e => `- ${e.templateElement?.label}: ${e.value} [${e.confirmed ? "✓ confirmat" : "neconfirmat"}]`);

  // Preia reguli relevante
  const eligRules = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, projectId),
    with: { rule: true },
  });

  const failedRules = eligRules
    .filter(e => e.status === "failed")
    .map(e => `- ⚠️ ${e.rule?.description}`);

  // Date firmă
  const company = project.company;
  const latestFinancial = await db.query.companyFinancials.findFirst({
    where: eq(companyFinancials.companyId, company!.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  return `Ești Solomon, agentul AI al platformei DosarFonduri. Ajuți consultantul să completeze dosarul de finanțare "${project.name}" pentru firma "${company?.denumire}" (CUI: ${company?.cui}).

## ROLUL TĂU
- Colectezi date inteligent din conversație și din documentele uploadate
- Extragi informații relevante pentru câmpurile necompletate
- Prelucrezi datele conform regulilor din ghidul de finanțare
- Ești proactiv: întrebi despre câmpurile lipsă, sugerezi ce documente mai sunt necesare
- Răspunzi în română, profesional dar accesibil

## DATE FIRMĂ (din ONRC)
- Denumire: ${company?.denumire}
- CUI: ${company?.cui}
- Forma juridică: ${company?.formaJuridica}
- CAEN: ${company?.caen || "nespecificat"}
- Adresă: ${company?.adresa}, ${company?.judet}
- Angajați: ${latestFinancial?.f30?.numarMediuSalariati || "necunoscut"}
- Cifra afaceri: ${latestFinancial?.f20?.cifraAfaceriNeta || "necunoscut"} RON
- An înființare: ${company?.anInfiintare || "necunoscut"}

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

// ═══ PROCESARE MESAJ ═══
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
  const model = config?.solomonModel || "claude-opus-4-6";
  const useET = config?.solomonET ?? true;

  // Build system prompt
  const systemPrompt = await buildSystemPrompt(projectId, organizationId);

  // Get conversation history
  const history = await db.query.solomonMessages.findMany({
    where: eq(solomonMessages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
    limit: 50, // ultimi 50 mesaje
  });

  // Build messages array
  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Build current message content
  let userContent: Anthropic.ContentBlockParam[] = [];

  // Atașamente (documente uploadate)
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.extractedText) {
        userContent.push({
          type: "text",
          text: `[Document uploadat: ${att.fileName}]\n\nConținut extras:\n${att.extractedText}`,
        });
      }
      // TODO: Pentru imagini, adaugă ca image block
    }
  }

  // Mesajul text
  if (content.trim()) {
    userContent.push({ type: "text", text: content });
  }

  messages.push({ role: "user", content: userContent });

  // Salvează mesajul user-ului
  await db.insert(solomonMessages).values({
    conversationId,
    role: "user",
    content,
    attachments: attachments ? JSON.stringify(attachments) : null,
  });

  // API call cu streaming
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

  // Return SSE stream
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

        // Extrage elemente din răspuns (format hidden JSON)
        const elementsMatch = fullResponse.match(/<!--ELEMENTS_JSON\[(.*?)\]ELEMENTS_JSON-->/s);
        let extractedElements: any[] = [];
        if (elementsMatch) {
          try {
            extractedElements = JSON.parse(`[${elementsMatch[1]}]`);
          } catch {}
        }

        // Salvează elementele extrase în proiect
        if (extractedElements.length > 0) {
          for (const el of extractedElements) {
            const projectEl = await db.query.projectElements.findFirst({
              where: and(
                eq(projectElements.projectId, projectId),
              ),
              with: {
                templateElement: {
                  where: eq(templateElements.key, el.key),
                },
              },
            });

            // Alternativ: caută direct prin template element key
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

          // Trimite event cu elementele extrase
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "elements_extracted",
            elements: extractedElements,
          })}\n\n`));
        }

        // Salvează mesajul assistant
        // Curăță hidden JSON din răspunsul vizibil
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

        // Log AI usage
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
```

---

## 5.2 ROUTES SOLOMON

```typescript
// apps/api/src/routes/solomon.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db";
import { solomonConversations, solomonMessages } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { processSolomonMessage } from "../services/solomon";
import { uploadFile, getFileBuffer } from "../services/storage";
import { extractTextFromPDF } from "../services/ocr";

export const solomonRoutes = new Hono();

// Creare conversație
solomonRoutes.post("/projects/:projectId/conversations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const config = await db.query.orgConfig.findFirst({
    where: (cfg, { eq }) => eq(cfg.organizationId, auth.organizationId!),
  });

  const [conv] = await db.insert(solomonConversations).values({
    projectId,
    userId: auth.userId,
    model: config?.solomonModel || "claude-opus-4-6",
  }).returning();

  return c.json(conv, 201);
});

// Lista conversații
solomonRoutes.get("/projects/:projectId/conversations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const convs = await db.query.solomonConversations.findMany({
    where: eq(solomonConversations.projectId, projectId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });

  return c.json(convs);
});

// Trimite mesaj (SSE streaming)
solomonRoutes.post("/conversations/:convId/messages", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const convId = c.req.param("convId");

  const conv = await db.query.solomonConversations.findFirst({
    where: eq(solomonConversations.id, convId),
  });
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const { content } = await c.req.json();

  const stream = await processSolomonMessage({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    content,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Upload document în conversație
solomonRoutes.post("/conversations/:convId/upload", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const convId = c.req.param("convId");

  const conv = await db.query.solomonConversations.findFirst({
    where: eq(solomonConversations.id, convId),
  });
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const message = (formData.get("message") as string) || "";

  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  // Extrage text din document
  let extractedText = "";
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    extractedText = await extractTextFromPDF(buffer);
  }
  // TODO: DOCX, XLSX, imagini

  // Procesează cu Solomon
  const stream = await processSolomonMessage({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    content: message || `Am uploadat documentul "${file.name}". Extrage informațiile relevante.`,
    attachments: [{
      fileId,
      fileName: file.name,
      mimeType: file.type,
      extractedText,
    }],
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Istoric mesaje
solomonRoutes.get("/conversations/:convId/messages", async (c) => {
  const convId = c.req.param("convId");

  const messages = await db.query.solomonMessages.findMany({
    where: eq(solomonMessages.conversationId, convId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  return c.json(messages);
});
```

---

## 5.3 FRONTEND: SOLOMON CHAT

### Referință UI: `SolomonView` din `05b_ProjectView.jsx`

### Layout: full-height chat (în cadrul ProjectView sidebar arbore)

```
┌──────────────────────────────────────────────────────┐
│  TOOLBAR                                              │
│  MODEL [Sonnet|Opus]  ✨ Extended Thinking  Solomon·Agent│
├──────────────────────────────────────────────────────┤
│                                                       │
│  CHAT MESSAGES (scroll)                               │
│                                                       │
│  🤖 Bun venit! Sunt Solomon...                       │
│                                                       │
│                    Proiectul vizează achiziția... 👤  │
│                                                       │
│  🤖 Am înregistrat detaliile:                        │
│     **Tip investiție:** Achiziție echipamente          │
│     **Valoare estimată:** 150,000 EUR                 │
│     ┌──────────────────────────────┐                  │
│     │ ✅ 3 elemente extrase       │ ← extraction card │
│     │  · Tip investiție            │                  │
│     │  · Valoare estimată          │                  │
│     │  · Scop proiect              │                  │
│     └──────────────────────────────┘                  │
│                                                       │
├──────────────────────────────────────────────────────┤
│  [📎 Upload] [📋 Paste]  [input text...       ] [➤]  │
└──────────────────────────────────────────────────────┘
```

### Toolbar (din prototip):
- **Model selector** — pills `[Sonnet]` / `[Opus]` cu active state (albastru). Schimbă modelul pentru mesajele următoare. Vizibil doar dacă configurat (org_config.solomonAllowModelSwitch)
- **ET toggle** — buton `✨ Extended Thinking` cu border mov când activ. Activează raționament avansat. Budget tokens din org_config
- **Label:** "Solomon · Agent colectare date" (dreapta, muted)

### Inline Refine (din prototip — killer feature):
- Consultantul **selectează text** dintr-un răspuns Solomon
- Apare popup la poziția selecției cu:
  - Text selectat (truncat, border-left albastru)
  - Input: "Ex: fă-l mai formal, adaugă detalii..."
  - Buton "Rescrie"
- Submit → Solomon regenerează **doar fragmentul selectat** conform instrucțiunii
- Util pentru: reformulare descrieri proiect, ajustare ton oficial, completare detalii

### Componente:
```
SolomonChat.tsx
├── SolomonToolbar.tsx (model selector + ET toggle)
├── MessageList.tsx (scroll, markdown render)
│   ├── UserMessage.tsx
│   ├── AssistantMessage.tsx (cu **bold** + liste + inline refine trigger)
│   └── ElementsExtractedCard.tsx (card cu elemente extrase, confirmabile)
├── InlineRefinePopup.tsx (popup la text select)
├── ChatInput.tsx (upload btn + paste btn + input + send btn)
└── ElementsSidebar.tsx (opțional, progres elemente live)
```

### Comportament cheie:
- SSE streaming — textul apare token cu token
- Upload document → OCR → procesare → extragere elemente automat
- Când Solomon extrage câmpuri, apare `ElementsExtractedCard` în chat cu lista câmpurilor + buton "✅ Salvat în Elemente"
- Badge Elemente din sidebar arbore se actualizează live (14/18 → 16/18)
- Markdown render: **bold**, liste, cod inline
- Inline refine pe text selectat din răspunsuri
- Model switch persistent per conversație (salvat în solomon_conversations.model)

---

## 5.4 CHECKLIST FAZA 5

- [ ] Service Solomon: construire system prompt dinamic (elemente, reguli, date firmă)
- [ ] Service Solomon: procesare mesaj cu streaming SSE
- [ ] Service Solomon: extragere elemente din răspuns (format hidden JSON)
- [ ] Service Solomon: salvare automată valori în project_elements
- [ ] Service Solomon: **inline refine — regenerare fragment selectat**
- [ ] Route Solomon: creare conversație, lista conversații
- [ ] Route Solomon: trimite mesaj (SSE streaming response)
- [ ] Route Solomon: upload document în conversație (OCR + procesare)
- [ ] Route Solomon: **switch model per conversație**
- [ ] Route Solomon: istoric mesaje
- [ ] Frontend: chat interface cu SSE streaming (05b_ProjectView.jsx SolomonView referință)
- [ ] **Frontend: toolbar cu model selector (Sonnet/Opus pills) + ET toggle**
- [ ] Frontend: upload document în chat
- [ ] Frontend: card "elemente extrase" în conversație cu confirmare
- [ ] **Frontend: inline refine — select text → popup → rescrie fragment**
- [ ] Frontend: input cu upload btn + paste btn + send btn
- [ ] Frontend: markdown render în răspunsuri (**bold**, liste)
- [ ] Frontend: **badge Elemente actualizat live în sidebar arbore**
- [ ] AI Usage logging per mesaj (tokens, cost, model)
