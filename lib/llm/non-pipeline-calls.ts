/**
 * Records LLM calls that belong to no pipeline run — the "Test this model"
 * button and the startup health check — and reports what they have cost this
 * month.
 *
 * These were previously spent with no record anywhere. `callLLM` does not log;
 * the pipeline STAGES do, so anything calling a provider outside a run was
 * invisible: absent from the Costs page and, more seriously, absent from the
 * monthly budget cap, which could therefore be passed without ever firing.
 *
 * They live in their own table rather than in llm_calls because that table's
 * run_id is NOT NULL with a foreign key to pipeline_runs. Storing them there
 * would mean inventing a fake run row, which would then show up as a run that
 * never happened in the sidebar and on the dashboard. See lib/db/schema.ts.
 *
 * Logging is best-effort by design: failing to record what a probe cost must
 * never be the reason the probe itself reports a failure. The number matters;
 * it does not matter more than the answer the user asked for.
 */
import { gte, sum } from "drizzle-orm";
import { getDb } from "../db/client";
import { nonPipelineLlmCallsTable } from "../db/schema";
import { getModels } from "../config/models";
import { costOf, findModelEntry } from "./pricing";

export type NonPipelineOrigin = "probe" | "health-check";

export async function logNonPipelineCall(params: {
  origin: NonPipelineOrigin;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const entry = findModelEntry(await getModels(), params.provider, params.model);
  const estimatedCost = costOf(entry, params.inputTokens, "input") + costOf(entry, params.outputTokens, "output");
  await getDb().insert(nonPipelineLlmCallsTable).values({
    timestamp: new Date(),
    origin: params.origin,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedCost,
  });
}

/** Swallows its own failure — see the header on why. */
export async function tryLogNonPipelineCall(params: Parameters<typeof logNonPipelineCall>[0]): Promise<void> {
  try {
    await logNonPipelineCall(params);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[sift] Could not record ${params.origin} cost: ${(err as Error).message}`);
  }
}

export async function nonPipelineSpendSince(since: Date): Promise<number> {
  const [{ total }] = await getDb()
    .select({ total: sum(nonPipelineLlmCallsTable.estimatedCost) })
    .from(nonPipelineLlmCallsTable)
    .where(gte(nonPipelineLlmCallsTable.timestamp, since));
  return Number(total ?? 0);
}
