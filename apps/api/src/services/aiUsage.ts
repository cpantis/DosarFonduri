import { db } from "../db";
import { aiUsageLog } from "../db/schema";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-opus-4-6": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
};

export async function logAIUsage(params: {
  organizationId: string;
  projectId?: string;
  userId?: string;
  agent: "solomon" | "neemia" | "ghid_rules" | "ocr" | "template_mapping";
  model: string;
  tokensInput: number;
  tokensOutput: number;
  action: string;
}) {
  const pricing = MODEL_COSTS[params.model] || { input: 0.01 / 1000, output: 0.03 / 1000 };
  const cost = (params.tokensInput * pricing.input) + (params.tokensOutput * pricing.output);

  await db.insert(aiUsageLog).values({
    organizationId: params.organizationId,
    projectId: params.projectId,
    userId: params.userId || null,
    agent: params.agent,
    model: params.model,
    tokensInput: params.tokensInput,
    tokensOutput: params.tokensOutput,
    cost: cost.toFixed(6),
    action: params.action,
  });
}
