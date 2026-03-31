/**
 * RAG v2 — Metadata enrichment for chunks (Sonnet).
 *
 * A single Sonnet call per document analyzes all chunk contents
 * and assigns semantic metadata (layer, topic, importance) per chunk.
 * This metadata powers filtered hybrid search in Solomon.
 */
import { anthropic, withAILimit } from "../lib/anthropic";
import type { RagChunk } from "./ragChunker";

export interface ChunkMetadata {
  layer: "regula" | "punctaj" | "referinta" | "formula" | "structura" | "narativ";
  topic: string;
  doc_type: string;
  importance: "critical" | "normal" | "context";
}

/**
 * Enrich chunks with semantic metadata using a single Sonnet call.
 *
 * @param chunks - Document chunks from ragChunker
 * @param docType - Classification docType (ghid, fisa_evaluare, etc.)
 * @param docDescription - Human description from classifier
 * @returns Array of metadata objects, one per chunk (same order)
 */
export async function enrichChunksMetadata(
  chunks: RagChunk[],
  docType: string,
  docDescription: string,
): Promise<ChunkMetadata[]> {
  if (chunks.length === 0) return [];

  // Build a summary of chunks for Sonnet (max ~6000 chars to stay fast)
  const chunkSummaries = chunks.map((c, i) => {
    const preview = c.content.slice(0, 150).replace(/\n/g, " ");
    return `[${i}] p${c.pageStart || "?"}: ${preview}...`;
  });

  const summaryText = chunkSummaries.join("\n");
  // Truncate if too long
  const truncated = summaryText.length > 6000
    ? summaryText.slice(0, 6000) + "\n... (truncated)"
    : summaryText;

  const response = await withAILimit(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `Ești expert în dosare de fonduri europene. Analizezi chunk-uri de document și le asignezi metadata semantică.

LAYERS (ce tip de conținut e):
- regula = reguli de eligibilitate, condiții obligatorii, criterii de conformitate
- punctaj = criterii de evaluare/selecție, grile de punctaj, scoruri
- referinta = tabele de referință, liste (UAT, NACE, praguri), anexe cu date
- formula = formule de calcul, indicatori financiari, metodologie calcul
- structura = structura programului, calendare, termene, proceduri
- narativ = explicații, descrieri generale, context, introduceri

IMPORTANCE:
- critical = reguli eliminatorii, praguri obligatorii, condiții sine qua non
- normal = informații importante pentru dosar
- context = informații de fundal, introduceri, definiții generale

Răspunde cu un JSON array cu câte un obiect per chunk, în ordine.
Fiecare obiect: { "layer": "...", "topic": "scurt 3-5 cuvinte", "importance": "..." }
DOAR JSON, fără explicații.`,
        messages: [
          {
            role: "user",
            content: `Document: ${docDescription} (tip: ${docType})
Chunks (${chunks.length}):

${truncated}

Returnează JSON array cu ${chunks.length} obiecte, unul per chunk.`,
          },
        ],
      }),
    "batch",
  );

  const text =
    response.content?.[0]?.type === "text" ? response.content[0].text : "[]";
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Array<{
      layer?: string;
      topic?: string;
      importance?: string;
    }>;

    // Map parsed results to chunks, filling defaults for any missing
    return chunks.map((_, i) => {
      const meta = parsed[i] || {};
      return {
        layer: (meta.layer as ChunkMetadata["layer"]) || "narativ",
        topic: meta.topic || docDescription,
        doc_type: docType,
        importance: (meta.importance as ChunkMetadata["importance"]) || "normal",
      };
    });
  } catch {
    console.warn("[metadataEnricher] Failed to parse Sonnet response, using defaults");
    return chunks.map(() => ({
      layer: "narativ" as const,
      topic: docDescription,
      doc_type: docType,
      importance: "normal" as const,
    }));
  }
}
