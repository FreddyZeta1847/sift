// scripts/regenerate-posts.ts
/**
 * "Regenerate posts" — same topics, different text. Takes the candidates
 * behind an earlier run's posts and re-runs only the Draft Generator on
 * them, producing a fresh set of post rows tied to a new run (the old
 * posts are left in place, not overwritten, so both drafts stay comparable
 * via `npm run view-posts`). No ingestion, no re-curation — the 3 topics
 * are exactly whatever `sourceRunId` already produced.
 *
 * Usage:
 *
 *     npm run regenerate-posts -- <sourceRunId>
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable, postsTable, candidatesTable } from "../lib/db/schema";
import { runDraftGenerator } from "../lib/draft/run";
import { BudgetCapAbort } from "../lib/llm/cost-safety";
import type { CuratedItem } from "../lib/curation/run";
import type { PipelineOutcome } from "./run-pipeline";

export async function regeneratePosts(sourceRunId: number): Promise<PipelineOutcome> {
  runMigrations();
  const db = getDb();

  const priorPosts = await db.select().from(postsTable).where(eq(postsTable.runId, sourceRunId));
  if (priorPosts.length === 0) {
    throw new Error(`No posts found for run ${sourceRunId} — nothing to regenerate.`);
  }

  const candidateIds = [...new Set(priorPosts.map((p) => p.candidateId))];
  const candidates = await db.select().from(candidatesTable).where(inArray(candidatesTable.id, candidateIds));
  const items: CuratedItem[] = candidates.map((c) => ({
    id: c.id,
    url: c.url,
    sourceRecap: c.sourceRecap,
    whyPicked: "",
  }));

  const [run] = await db
    .insert(pipelineRunsTable)
    .values({ startedAt: new Date(), type: "regenerate-posts" })
    .returning({ id: pipelineRunsTable.id });
  const runId = run.id;

  try {
    await runDraftGenerator(items, runId);
    await db
      .update(pipelineRunsTable)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(pipelineRunsTable.id, runId));
    return { status: "success" };
  } catch (err) {
    const abortReason = err instanceof BudgetCapAbort ? "budget_cap" : "api_error";
    const errorMessage = (err as Error).message;
    // eslint-disable-next-line no-console
    console.error(`[sift] Regenerate-posts run ${runId} aborted (${abortReason}): ${errorMessage}`);
    await db
      .update(pipelineRunsTable)
      .set({ status: "aborted", abortReason, errorMessage, finishedAt: new Date() })
      .where(eq(pipelineRunsTable.id, runId));
    return { status: "aborted", abortReason };
  }
}

if (process.argv[1]?.endsWith("regenerate-posts.ts")) {
  const sourceRunId = Number(process.argv[2]);
  if (!Number.isInteger(sourceRunId)) {
    // eslint-disable-next-line no-console
    console.error("Usage: npm run regenerate-posts -- <sourceRunId>");
    process.exit(1);
  }
  regeneratePosts(sourceRunId).then((result) => {
    if (result.status === "success") {
      // eslint-disable-next-line no-console
      console.log("[sift] Regenerate-posts run complete.");
    } else {
      // eslint-disable-next-line no-console
      console.log(`[sift] Regenerate-posts run aborted (${result.abortReason}). See error above.`);
      process.exitCode = 1;
    }
  });
}
