// scripts/run-pipeline.ts
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable } from "../lib/db/schema";
import { getSources } from "../lib/config/sources";
import { runIngestion } from "../lib/ingestion/run";
import { runCuration } from "../lib/curation/run";
import { runDraftGenerator } from "../lib/draft/run";
import { BudgetCapAbort } from "../lib/llm/cost-safety";

export type PipelineOutcome =
  | { status: "success" }
  | { status: "aborted"; abortReason: "budget_cap" | "api_error" };

export async function runPipeline(type: "scheduled" | "catchup" | "manual"): Promise<PipelineOutcome> {
  // Idempotent — safe to call on every run. Ensures a fresh `data/` directory
  // (first-ever run, a new clone, a fresh Docker volume) works with zero
  // manual setup, per the locked "boots with zero configuration" requirement.
  runMigrations();

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
    return { status: "success" };
  } catch (err) {
    const abortReason = err instanceof BudgetCapAbort ? "budget_cap" : "api_error";
    const errorMessage = (err as Error).message;
    // eslint-disable-next-line no-console
    console.error(`[sift] Pipeline run ${runId} aborted (${abortReason}): ${errorMessage}`);
    await db
      .update(pipelineRunsTable)
      .set({ status: "aborted", abortReason, errorMessage, finishedAt: new Date() })
      .where(eq(pipelineRunsTable.id, runId));
    return { status: "aborted", abortReason };
  }
}

if (process.argv[1]?.endsWith("run-pipeline.ts")) {
  runPipeline("manual").then((result) => {
    if (result.status === "success") {
      // eslint-disable-next-line no-console
      console.log("[sift] Pipeline run complete.");
    } else {
      // eslint-disable-next-line no-console
      console.log(`[sift] Pipeline run aborted (${result.abortReason}). See error above.`);
      process.exitCode = 1;
    }
  });
}
