/**
 * Per-post Regenerate action (Phase 3, Task 6).
 *
 * `regeneratePost` re-runs draft generation for a single candidate by
 * reusing the exact `generateDrafts` core shared with the batch pipeline
 * (see generate.ts's header), tags the run `regenerate-posts` so it's
 * distinguishable in pipeline_runs, and inserts the result as a `pending:
 * true` sibling row alongside the existing post — it never overwrites or
 * deletes the original. The shared `run-guard` in-memory lock (see
 * run-guard.ts) is held for the duration so Regenerate can't race a batch
 * pipeline run or another Regenerate call; it is always released in a
 * `finally`, including when `generateDrafts` throws.
 *
 * `keepVersion` resolves the propose/compare UI once the user has picked a
 * winner: it deletes the loser and clears `pending` on the keeper, leaving
 * exactly one row for that candidate again.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { pipelineRunsTable, postsTable, candidatesTable } from "../db/schema";
import { generateDrafts } from "./generate";
import { checkAndSetRunning, clearRunning } from "../pipeline/run-guard";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function regeneratePost(postId: number): Promise<ActionResult> {
  if (!checkAndSetRunning()) {
    return { ok: false, error: "Already running" };
  }

  try {
    const db = getDb();
    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    if (!post) {
      return { ok: false, error: `Post ${postId} not found` };
    }
    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, post.candidateId));
    if (!candidate) {
      return { ok: false, error: `Candidate ${post.candidateId} not found` };
    }

    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "regenerate-posts" })
      .returning({ id: pipelineRunsTable.id });

    try {
      const drafts = await generateDrafts(
        [{ id: candidate.id, url: candidate.url, sourceRecap: candidate.sourceRecap, whyPicked: "" }],
        run.id
      );
      if (drafts.length === 0) {
        await db
          .update(pipelineRunsTable)
          .set({ status: "aborted", abortReason: "api_error", errorMessage: "No draft returned", finishedAt: new Date() })
          .where(eq(pipelineRunsTable.id, run.id));
        return { ok: false, error: "No draft returned" };
      }

      const draft = drafts[0];
      await db.insert(postsTable).values({
        candidateId: post.candidateId,
        runId: run.id,
        url: draft.url,
        title: draft.title,
        originalText: draft.text,
        imagePrompt: draft.imagePrompt,
        pending: true,
      });
      await db
        .update(pipelineRunsTable)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(pipelineRunsTable.id, run.id));
      return { ok: true };
    } catch (err) {
      const errorMessage = (err as Error).message;
      await db
        .update(pipelineRunsTable)
        .set({ status: "aborted", abortReason: "api_error", errorMessage, finishedAt: new Date() })
        .where(eq(pipelineRunsTable.id, run.id));
      return { ok: false, error: errorMessage };
    }
  } finally {
    clearRunning();
  }
}

export async function keepVersion(keptPostId: number, deletedPostId: number): Promise<ActionResult> {
  try {
    const db = getDb();
    await db.delete(postsTable).where(eq(postsTable.id, deletedPostId));
    await db.update(postsTable).set({ pending: false }).where(eq(postsTable.id, keptPostId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
