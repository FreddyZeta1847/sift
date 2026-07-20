/**
 * Prunes posts by age, parallel to lib/candidates/retention.ts's
 * pruneStaleCandidates. Off by default (settings.postsRetentionDays ===
 * null). Uniform regardless of a post's posted/discarded state — a posted
 * post ages out on the same schedule as an unposted one, since once posted
 * it already lives on LinkedIn; there's no reason to keep sift's own copy
 * around any longer than an unposted draft.
 *
 * posts has no createdAt of its own — age is measured via its originating
 * pipeline_runs.startedAt (posts.runId), the same join scripts/view-posts.ts
 * already performs for display, rather than adding a migration for it.
 *
 * Called from scripts/run-pipeline.ts's `finally` block — i.e. at the end
 * of every pipeline run, regardless of success/abort. Unlike candidate
 * pruning (called at the *start*, ahead of that run's own ingestion, so a
 * stale backlog doesn't grow unbounded before curation ever sees it), post
 * pruning has no relationship to the current run's own outcome, so there's
 * no reason to skip it just because that run's ingestion/curation/drafting
 * failed.
 */
import { eq, inArray, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { postsTable, pipelineRunsTable } from "../db/schema";
import { getSettings } from "../config/settings";

export async function pruneStalePosts(): Promise<{ deleted: number }> {
  const settings = await getSettings();
  if (settings.postsRetentionDays === null) {
    return { deleted: 0 };
  }

  const cutoff = new Date(Date.now() - settings.postsRetentionDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const stale = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .innerJoin(pipelineRunsTable, eq(postsTable.runId, pipelineRunsTable.id))
    .where(lt(pipelineRunsTable.startedAt, cutoff));

  if (stale.length === 0) {
    return { deleted: 0 };
  }

  const deleted = await db
    .delete(postsTable)
    .where(
      inArray(
        postsTable.id,
        stale.map((s) => s.id)
      )
    )
    .returning({ id: postsTable.id });

  return { deleted: deleted.length };
}
