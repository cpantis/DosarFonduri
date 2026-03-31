/**
 * RAG v2 — Solomon tool use handlers.
 *
 * Tools:
 *   search_knowledge     — hybrid search in RAG v2 chunks (vector + keyword)
 *   get_session_documents — list classified documents on session
 *
 * Called by Solomon via Anthropic tool_use blocks.
 */
import { hybridSearch } from "./hybridSearch";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq, and } from "drizzle-orm";

// ═══════════════════════════════════════════
// TOOL DEFINITIONS for Anthropic API
// ═══════════════════════════════════════════

export const SOLOMON_TOOLS = [
  {
    name: "search_knowledge" as const,
    description: "Caută informații din documentele sesiunii (ghid, fișă evaluare, anexe) și baza de cunoștințe a cabinetului. Folosește filtre de layer pentru precizie. Caută MEREU înainte să afirmi ceva despre regulile ghidului, criterii de selecție, cheltuieli eligibile, sau intensitatea sprijinului.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Ce cauți, în română, cât mai specific",
        },
        source_type: {
          type: "string" as const,
          enum: ["session", "knowledge_base"],
          description: "session = documente sesiune. knowledge_base = documente strategice cabinet",
        },
        layers: {
          type: "array" as const,
          items: {
            type: "string" as const,
            enum: ["regula", "punctaj", "referinta", "formula", "structura", "narativ"],
          },
          description: "Filtrează: regula=eligibilitate, punctaj=selecție, referinta=tabele, formula=calcule, structura=documente necesare, narativ=context",
        },
        top_k: {
          type: "integer" as const,
          description: "Câte rezultate (default 5, max 10)",
        },
      },
      required: ["query" as const],
    },
  },
  {
    name: "get_session_documents" as const,
    description: "Vezi ce documente sunt disponibile pe sesiunea curentă — ghiduri, template-uri, documente client, oferte. Folosește la începutul conversației sau când trebuie să știi ce ai la dispoziție.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ═══════════════════════════════════════════
// TOOL 1: search_knowledge
// ═══════════════════════════════════════════

interface SearchKnowledgeInput {
  query: string;
  source_type?: "session" | "knowledge_base";
  layers?: string[];
  top_k?: number;
}

async function handleSearchKnowledge(
  input: SearchKnowledgeInput,
  context: { cabinetId: string; sessionId: string },
): Promise<string> {
  const results = await hybridSearch({
    query: input.query,
    cabinetId: context.cabinetId,
    sessionId: context.sessionId,
    sourceType: input.source_type,
    layers: input.layers,
    topK: Math.min(input.top_k || 5, 10),
  });

  if (results.length === 0) {
    return "Nu am găsit informații relevante. Încearcă cu alți termeni sau fără filtre de layer.";
  }

  return results
    .map((r, i) => {
      const meta = r.metadata as Record<string, any>;
      const location = [
        meta.section && `§ ${meta.section}`,
        meta.page && `pag. ${meta.page}`,
        meta.doc_type,
        meta.layer,
        meta.importance === "critical" && "⚠️ CRITIC",
      ]
        .filter(Boolean)
        .join(" · ");

      return `[${i + 1}] ${location}\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

// ═══════════════════════════════════════════
// TOOL 2: get_session_documents
// ═══════════════════════════════════════════

async function handleGetSessionDocuments(
  context: { cabinetId: string; sessionId: string },
): Promise<string> {
  // sessionId maps to folderId in the current upload flow
  const docs = await db.query.documents.findMany({
    where: and(
      eq(documents.folderId, context.sessionId),
      eq(documents.organizationId, context.cabinetId),
    ),
  });

  if (docs.length === 0) {
    return "Nu sunt documente încărcate pe această sesiune.";
  }

  return docs
    .map((doc) => {
      const c = doc.classification as Record<string, any> | null;
      if (!c) {
        const status = doc.status === "processed" ? "✅" : doc.status === "processing" ? "⏳" : "📄";
        return `${status} ${doc.name} — neclasificat (processingType: ${doc.processingType || "necunoscut"})`;
      }

      const status = c.isProcessed ? "✅" : "⏳";
      const details = [
        c.docType,
        c.routingAction,
        c.chunksCount && `${c.chunksCount} chunks`,
        c.extractedFields && `${c.extractedFields} câmpuri extrase`,
      ]
        .filter(Boolean)
        .join(", ");

      return `${status} ${doc.name} — ${c.description || c.docType} (${details})`;
    })
    .join("\n");
}

// ═══════════════════════════════════════════
// ROUTER — execute the correct tool
// ═══════════════════════════════════════════

export async function executeSolomonTool(
  toolName: string,
  toolInput: any,
  context: { cabinetId: string; sessionId: string },
): Promise<string> {
  switch (toolName) {
    case "search_knowledge":
      return handleSearchKnowledge(toolInput, context);
    case "get_session_documents":
      return handleGetSessionDocuments(context);
    default:
      return `Tool necunoscut: ${toolName}`;
  }
}
