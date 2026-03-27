/**
 * Embedding service — OpenAI text-embedding-3-small (1536 dims).
 *
 * Used for RAG: guide chunks → embeddings → pgvector → semantic retrieval.
 * Batch API: up to 2048 inputs per call.
 */
import { getOpenAI } from "../lib/openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const MAX_BATCH_SIZE = 100; // conservative batch size

export { EMBEDDING_DIMS };

/** Generate embedding for a single text */
export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMS,
  });
  return response.data[0].embedding;
}

/** Generate embeddings for multiple texts (batched) */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = getOpenAI();
  const results: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMS,
    });

    // OpenAI returns embeddings sorted by index
    const sorted = response.data.sort((a: any, b: any) => a.index - b.index);
    results.push(...sorted.map(d => d.embedding));
  }

  return results;
}

/** Approximate token count (for chunking budget) */
export function estimateTokens(text: string): number {
  // ~4 chars per token for English, ~3.5 for Romanian
  return Math.ceil(text.length / 3.5);
}
