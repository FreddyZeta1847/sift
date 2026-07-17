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
import { pruneStaleCandidates } from "../lib/candidates/retention";

export type PipelineOutcome =
  | { status: "success" }
  | { status: "aborted"; abortReason: "budget_cap" | "api_error" };

export async function runPipeline(type: "scheduled" | "catchup" | "manual"): Promise<PipelineOutcome> {
  // Idempotent — safe to call on every run. Ensures a fresh `data/` directory
  // (first-ever run, a new clone, a fresh Docker volume) works with zero
  // manual setup, per the locked "boots with zero configuration" requirement.
  runMigrations();
  await pruneStaleCandidates();

  const db = getDb();
  const [run] = await db
    .insert(pipelineRunsTable)
    .values({ startedAt: new Date(), type })
    .returning({ id: pipelineRunsTable.id });
  const runId = run.id;

  try {
    const sources = await getSources();
    const ingested = await runIngestion(sources, runId);
    // eslint-disable-next-line no-console
    console.log(
      `[sift] Ingestion: ${ingested.written} new candidate(s) (${ingested.fetched} fetched, ${ingested.fetched - ingested.written} already seen).`
    );
    for (const s of ingested.perSource) {
      // eslint-disable-next-line no-console
      console.log(`  - ${s.source}: ${s.written} new / ${s.fetched} fetched`);
    }
    if (ingested.skippedSources.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[sift] Skipped sources (fetch failed): ${ingested.skippedSources.join(", ")}`);
    }

    const curated = await runCuration(runId);
    if (curated.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[sift] Curation: chose ${curated.length} topic(s):`);
      for (const item of curated) {
        // eslint-disable-next-line no-console
        console.log(`  - ${item.url}`);
      }
      const drafted = await runDraftGenerator(curated, runId);
      // eslint-disable-next-line no-console
      console.log(`[sift] Draft Generator: wrote ${drafted.written} post(s).`);
    } else {
      // eslint-disable-next-line no-console
      console.log("[sift] Curation: no topics chosen — nothing to draft.");
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
