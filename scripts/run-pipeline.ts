// scripts/run-pipeline.ts
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { pipelineRunsTable } from "../lib/db/schema";
import { getSources } from "../lib/config/sources";
import { runIngestion } from "../lib/ingestion/run";
import { runCuration } from "../lib/curation/run";
import { runDraftGenerator } from "../lib/draft/run";
import { BudgetCapAbort } from "../lib/llm/cost-safety";

export async function runPipeline(type: "scheduled" | "catchup" | "manual"): Promise<void> {
  const db = getDb();
  const [run] = await db
    .insert(pipelineRunsTable)
    .values({ startedAt: new Date(), type })
    .returning({ id: pipelineRunsTable.id });
  const runId = run.id;

  try {
    const sources = await getSources();
    await runIngestion(sources, runId);

    const curated = await runCuration(runId);
    if (curated.length > 0) {
      await runDraftGenerator(curated, runId);
    }

    await db
      .update(pipelineRunsTable)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(pipelineRunsTable.id, runId));
  } catch (err) {
    const abortReason = err instanceof BudgetCapAbort ? "budget_cap" : "api_error";
    await db
      .update(pipelineRunsTable)
      .set({ status: "aborted", abortReason, finishedAt: new Date() })
      .where(eq(pipelineRunsTable.id, runId));
  }
}

if (process.argv[1]?.endsWith("run-pipeline.ts")) {
  runPipeline("manual").then(() => {
    // eslint-disable-next-line no-console
    console.log("[sift] Pipeline run complete.");
  });
}
