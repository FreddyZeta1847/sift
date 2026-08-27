/**
 * Budget enforcement and per-call cost recording.
 *
 * Both functions resolve a price from the user's model registry
 * (config/models.json) rather than a hard-coded table, and both are keyed by
 * provider AND model — the same model name costs different amounts through
 * different providers, and nothing at all through a local one.
 *
 * A pair with no registry row costs 0 here, which is unavoidable: nobody has
 * told us what it costs. What that must never do is look like a confident
 * zero, so callers that display spend use isPriced() to flag it — see
 * lib/llm/pricing.ts.
 */
import { gte, sum } from "drizzle-orm";
import { getDb } from "../db/client";
import { llmCallsTable } from "../db/schema";
import { getSettings } from "../config/settings";
import { getModels } from "../config/models";
import { costOf, findModelEntry } from "./pricing";
import { nonPipelineSpendSince } from "./non-pipeline-calls";

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
  providerId: string,
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

  // Both tables. Counting only pipeline spend would let model checks and
  // Test-button probes accumulate past the cap unseen — the same invisibility
  // this whole change set exists to remove.
  const entry = findModelEntry(await getModels(), providerId, model);
  const monthTotal = Number(total ?? 0) + (await nonPipelineSpendSince(startOfCurrentUtcMonth()));
  const upperBound = monthTotal + costOf(entry, promptTokens, "input") + costOf(entry, maxOutputTokens, "output");

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
  const entry = findModelEntry(await getModels(), params.provider, params.model);
  const estimatedCost = costOf(entry, params.inputTokens, "input") + costOf(entry, params.outputTokens, "output");
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
