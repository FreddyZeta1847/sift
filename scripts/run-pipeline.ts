/**
 * The end-to-end pipeline: ingest -> curate -> draft, recorded as one
 * pipeline_runs row. Split into createPipelineRun() (row + housekeeping)
 * and executePipelineRun() (the actual stages) so a caller can start a
 * run, get its id back immediately, and let it continue in the
 * background — see app/config/settings/actions.ts's startRun(), which
 * polls the row's currentStage while the run is in flight.
 */
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable } from "../lib/db/schema";
import { getSources } from "../lib/config/sources";
import { runIngestion } from "../lib/ingestion/run";
import { runCuration } from "../lib/curation/run";
import { runDraftGenerator } from "../lib/draft/run";
import { BudgetCapAbort } from "../lib/llm/cost-safety";
import { pruneStaleCandidates } from "../lib/candidates/retention";
import { backfillCandidateSourceIds } from "../lib/candidates/backfill-source";
import { pruneStalePosts } from "../lib/posts/retention";

export type PipelineOutcome =
  | { status: "success" }
  | { status: "aborted"; abortReason: "budget_cap" | "api_error" };

type PipelineRunType = "scheduled" | "catchup" | "manual";

// Split from the combined runPipeline() below so a caller (the sidebar's
// startRun() Server Action, see app/config/settings/actions.ts) can create
// the row and get a runId back immediately, then let executePipelineRun()
// continue unawaited — the only way real Run Now progress polling is
// possible, since a runId has to exist *before* the pipeline itself starts.
export async function createPipelineRun(type: PipelineRunType): Promise<number> {
  // Idempotent — safe to call on every run. Ensures a fresh `data/` directory
  // (first-ever run, a new clone, a fresh Docker volume) works with zero
  // manual setup, per the locked "boots with zero configuration" requirement.
  runMigrations();
  await pruneStaleCandidates();
  // Backfills sourceId for any candidate rows still missing it (legacy
  // rows from before this column existed) — a no-op once everything
  // resolvable has been resolved. Must run before runCuration() below, not
  // after, so this run's own pool query already benefits from it.
  await backfillCandidateSourceIds();

  const db = getDb();
  const [run] = await db
    .insert(pipelineRunsTable)
    .values({ startedAt: new Date(), type })
    .returning({ id: pipelineRunsTable.id });
  return run.id;
}

export async function executePipelineRun(runId: number): Promise<PipelineOutcome> {
  const db = getDb();

  try {
    await db.update(pipelineRunsTable).set({ currentStage: "Ingesting sources…" }).where(eq(pipelineRunsTable.id, runId));
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

    // No "Curating…" write here — runCuration() writes its own currentStage
    // once it knows the real pool size (the whole eligible backlog, not
    // just candidates ingested this run — see lib/curation/run.ts).
    const curated = await runCuration(runId);
    if (curated.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[sift] Curation: chose ${curated.length} topic(s):`);
      for (const item of curated) {
        // eslint-disable-next-line no-console
        console.log(`  - ${item.url}`);
      }
      await db
        .update(pipelineRunsTable)
        .set({ currentStage: `Drafting ${curated.length} post(s)…` })
        .where(eq(pipelineRunsTable.id, runId));
      const drafted = await runDraftGenerator(curated, runId);
      // eslint-disable-next-line no-console
      console.log(`[sift] Draft Generator: wrote ${drafted.written} post(s).`);
    } else {
      // eslint-disable-next-line no-console
      console.log("[sift] Curation: no topics chosen — nothing to draft.");
    }

    await db
      .update(pipelineRunsTable)
      .set({ status: "success", finishedAt: new Date(), currentStage: null })
      .where(eq(pipelineRunsTable.id, runId));
    return { status: "success" };
  } catch (err) {
    const abortReason = err instanceof BudgetCapAbort ? "budget_cap" : "api_error";
    const errorMessage = (err as Error).message;
    // eslint-disable-next-line no-console
    console.error(`[sift] Pipeline run ${runId} aborted (${abortReason}): ${errorMessage}`);
    await db
      .update(pipelineRunsTable)
      .set({ status: "aborted", abortReason, errorMessage, finishedAt: new Date(), currentStage: null })
      .where(eq(pipelineRunsTable.id, runId));
    return { status: "aborted", abortReason };
  } finally {
    // End-of-run housekeeping, unrelated to this run's own outcome — runs
    // whether the pipeline above succeeded or aborted, unlike candidate
    // pruning above (which runs at the *start*, for reasons specific to
    // candidates' own dedup/backlog sweep).
    await pruneStalePosts();
  }
}

export async function runPipeline(type: PipelineRunType): Promise<PipelineOutcome> {
  const runId = await createPipelineRun(type);
  return executePipelineRun(runId);
}

// A run whose row still has finishedAt = null when the server starts up
// didn't just take a while — the process that was executing it is gone
// (crash, restart, redeploy), so nothing will ever finish it. Left alone,
// getInProgressRun() would keep surfacing it forever as "still running."
// Called once at boot (see instrumentation.ts), alongside runMigrations().
export async function abortOrphanedRuns(): Promise<{ aborted: number }> {
  const db = getDb();
  const orphaned = await db
    .select({ id: pipelineRunsTable.id })
    .from(pipelineRunsTable)
    .where(isNull(pipelineRunsTable.finishedAt));
  if (orphaned.length === 0) return { aborted: 0 };

  await db
    .update(pipelineRunsTable)
    .set({ status: "aborted", abortReason: "server_restart", finishedAt: new Date(), currentStage: null })
    .where(isNull(pipelineRunsTable.finishedAt));
  return { aborted: orphaned.length };
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
