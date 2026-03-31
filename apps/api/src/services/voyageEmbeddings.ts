/**
 * Voyage AI embeddings — voyage-3 (query) + voyage-context-3 (documents)
 * 1024 dimensions, used by RAG v2 chunks table.
 *
 * Does NOT replace embeddings.ts (OpenAI) — that remains for guideChunks/solomonKnowledge.
 */
import { VoyageAIClient } from "voyageai";

let _client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!_client) {
    if (!process.env.VOYAGE_API_KEY) {
      throw new Error("VOYAGE_API_KEY not set — cannot use Voyage AI embeddings");
    }
    _client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
  }
  return _client;
}

/**
 * Embed a single query string — uses voyage-3 with inputType=query.
 * Returns a 1024-dim vector.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const client = getClient();
  const result = await client.embed({
    input: text,
    model: "voyage-3",
    inputType: "query",
  });
  return result.data![0]!.embedding!;
}

/**
 * Embed a batch of document chunks — uses voyage-context-3 (contextualized embeddings).
 * All chunks from a single document should be passed together so the model sees full context.
 * Returns one 1024-dim vector per chunk.
 *
 * @param documentChunks - All chunk texts from a single document
 */
export async function embedDocumentChunks(documentChunks: string[]): Promise<number[][]> {
  if (documentChunks.length === 0) return [];

  const client = getClient();

  // voyage-context-3 contextualizedEmbed: inputs is a list of documents,
  // each document is a list of chunks. We pass one document at a time.
  // Max 16,000 chunks total, 120K tokens total per request.
  const BATCH_SIZE = 1000; // conservative chunk count per request
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < documentChunks.length; i += BATCH_SIZE) {
    const batch = documentChunks.slice(i, i + BATCH_SIZE);

    const result = await client.contextualizedEmbed({
      inputs: [batch], // single document, multiple chunks
      model: "voyage-context-3",
      inputType: "document",
      outputDimension: 1024,
    });

    // Response: data[0] = first document, data[0].data = array of chunk embeddings
    const docResult = result.data![0]!;
    for (const chunkEmb of docResult.data!) {
      allEmbeddings.push(chunkEmb.embedding!);
    }
  }

  return allEmbeddings;
}

/**
 * Embed multiple independent texts (not from the same document).
 * Uses standard voyage-3 embed (not contextualized).
 * Good for knowledge base entries that are standalone.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  const BATCH_SIZE = 128; // voyage-3 max per request
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await client.embed({
      input: batch,
      model: "voyage-3",
      inputType: "document",
    });

    // Sort by index to ensure correct order
    const sorted = [...result.data!].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const item of sorted) {
      allEmbeddings.push(item.embedding!);
    }
  }

  return allEmbeddings;
}
