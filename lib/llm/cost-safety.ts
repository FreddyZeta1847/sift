import { and, gte, sum, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { llmCallsTable } from "../db/schema";
import { getSettings } from "../config/settings";
import { costOf } from "./pricing";

export class BudgetCapAbort extends Error {
  constructor() {
    super("Budget cap would be exceeded by this call");
    this.name = "BudgetCapAbort";
  }
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function assertBudgetAvailable(
  model: string,
  promptTokens: number,
  maxOutputTokens: number
): Promise<void> {
  const settings = await getSettings();
  if (settings.budgetCapUsd == null) return; // no cap configured, nothing to enforce

  const db = getDb();
  const [{ total }] = await db
    .select({ total: sum(llmCallsTable.estimatedCost) })
    .from(llmCallsTable)
    .where(gte(llmCallsTable.timestamp, startOfCurrentUtcMonth()));

  const monthTotal = Number(total ?? 0);
  const upperBound =
    monthTotal + costOf(model, promptTokens, "input") + costOf(model, maxOutputTokens, "output");

  if (upperBound > settings.budgetCapUsd) {
    throw new BudgetCapAbort();
  }
}

export async function logLlmCall(params: {
  runId: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const db = getDb();
  const estimatedCost =
    costOf(params.model, params.inputTokens, "input") + costOf(params.model, params.outputTokens, "output");
  await db.insert(llmCallsTable).values({
    timestamp: new Date(),
    runId: params.runId,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedCost,
  });
}
