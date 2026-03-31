/**
 * RAG v2 — Document version diff service.
 *
 * Compares two versions of the same document using Sonnet.
 * Produces a SEMANTIC diff (impact on project), not a textual diff.
 */
import { anthropic, withAILimit } from "../lib/anthropic";

export interface VersionDiffChange {
  type: "added" | "removed" | "modified";
  category: "eligibilitate" | "punctaj" | "buget" | "procedural" | "formular" | "altul";
  description: string;
  severity: "critical" | "important" | "minor";
  affectedElements: string[];
}

export interface VersionDiffResult {
  summary: string;
  changes: VersionDiffChange[];
  confidence: number;
  analyzedAt: string;
}

/**
 * Generate a semantic diff between two versions of a document.
 * Uses Sonnet to identify changes with IMPACT on the project.
 *
 * @param oldText - First ~3000 tokens from old document
 * @param newText - First ~3000 tokens from new document
 * @param docType - Classification docType
 */
export async function generateVersionDiff(
  oldText: string,
  newText: string,
  docType: string,
): Promise<VersionDiffResult> {
  const response = await withAILimit(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `Ești expert în fonduri europene. Compară două versiuni ale aceluiași document.
Identifică DOAR modificările cu impact pe proiect. NU lista diferențe cosmetice.

Categorii:
- eligibilitate: condiții noi/modificate/eliminate
- punctaj: criterii de selecție, praguri, punctaje
- buget: plafoane, intensități, cheltuieli eligibile
- procedural: termene, documente necesare
- formular: câmpuri noi/eliminate
- altul: alte modificări

Severity:
- critical: poate schimba eligibilitatea sau punctajul sub prag
- important: modifică calcule/argumente dar nu blochează
- minor: clarificări fără impact pe decizie

Răspunde DOAR cu JSON valid.`,
        messages: [
          {
            role: "user",
            content: `Tip document: ${docType}

VERSIUNE VECHE:
${oldText.slice(0, 4000)}

VERSIUNE NOUĂ:
${newText.slice(0, 4000)}

Returnează JSON:
{
  "summary": "rezumat scurt al modificărilor",
  "changes": [{ "type": "...", "category": "...", "description": "...", "severity": "...", "affectedElements": [] }],
  "confidence": 0.0-1.0
}`,
          },
        ],
      }),
    "batch",
  );

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || "Modificări detectate",
      changes: (parsed.changes || []).map((c: any) => ({
        type: c.type || "modified",
        category: c.category || "altul",
        description: c.description || "",
        severity: c.severity || "minor",
        affectedElements: c.affectedElements || [],
      })),
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      analyzedAt: new Date().toISOString(),
    };
  } catch {
    return {
      summary: "Nu am putut analiza diferențele",
      changes: [],
      confidence: 0,
      analyzedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check if a new document is an upgrade of an existing one.
 * Uses Sonnet for a quick title/content comparison.
 */
export async function checkSameDocument(
  oldTitle: string,
  oldPreview: string,
  newTitle: string,
  newPreview: string,
): Promise<{ isSameDocument: boolean; confidence: number }> {
  const response = await withAILimit(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        system: "Determină dacă două documente sunt versiuni diferite ale aceluiași document (ex: Ghid sM 4.1 Rev.2 vs Rev.3) sau documente complet diferite (ex: Ghid sM 4.1 vs Ghid sM 6.1). Răspunde DOAR cu JSON.",
        messages: [
          {
            role: "user",
            content: `Document 1: "${oldTitle}"\n${oldPreview.slice(0, 500)}\n\nDocument 2: "${newTitle}"\n${newPreview.slice(0, 500)}\n\nJSON: { "isSameDocument": true/false, "confidence": 0.0-1.0 }`,
          },
        ],
      }),
    "batch",
  );

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return {
      isSameDocument: !!parsed.isSameDocument,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  } catch {
    return { isSameDocument: false, confidence: 0 };
  }
}
