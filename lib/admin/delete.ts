/**
 * Guarded row deletion for the Admin page (`/admin`). FK enforcement is OFF
 * in this database — `lib/db/client.ts` only sets `journal_mode = WAL`,
 * never `PRAGMA foreign_keys = ON` — so an orphaning delete would silently
 * succeed rather than throw at the SQLite level. Integrity here is
 * entirely application code, following the same "never delete a row
 * something else still points to" rule `lib/candidates/retention.ts`
 * already establishes for age-based pruning, just applied to a direct
 * user-initiated delete instead:
 *
 * - `llm_calls`, `posts` — leaf rows, nothing in this schema references
 *   either one's id, so deletion is always allowed.
 * - `candidates` — blocked if any `posts.candidateId` references it.
 * - `pipeline_runs` — blocked if the run has its own posts, OR if a
 *   candidate it produced was later drafted into a post by a *different*
 *   run (candidates can outlive their birth run — see
 *   `CURATION-ENGINE--ranking-logic.md`'s cross-run backlog pool). If
 *   neither blocker applies, deleting a run cascades in application code
 *   to its own (now provably unreferenced) `llm_calls` and `candidates`
 *   rows before removing the run itself.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable } from "../db/schema";

export interface DeleteResult {
  ok: boolean;
  error?: string;
}

export async function deleteLlmCall(id: number): Promise<DeleteResult> {
  const db = getDb();
  await db.delete(llmCallsTable).where(eq(llmCallsTable.id, id));
  return { ok: true };
}

export async function deletePost(id: number): Promise<DeleteResult> {
  const db = getDb();
  await db.delete(postsTable).where(eq(postsTable.id, id));
  return { ok: true };
}

export async function deleteCandidate(id: number): Promise<DeleteResult> {
  const db = getDb();
  const referencing = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.candidateId, id));
  if (referencing.length > 0) {
    return {
      ok: false,
      error: `Cannot delete — candidate has an associated post (id ${referencing[0].id}). Delete the post first.`,
    };
  }
  await db.delete(candidatesTable).where(eq(candidatesTable.id, id));
  return { ok: true };
}

export async function deleteRun(id: number): Promise<DeleteResult> {
  const db = getDb();

  const ownPosts = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.runId, id));
  if (ownPosts.length > 0) {
    return { ok: false, error: `Cannot delete — run has ${ownPosts.length} post(s). Delete them first.` };
  }

  const ownCandidates = await db.select({ id: candidatesTable.id }).from(candidatesTable).where(eq(candidatesTable.runId, id));
  if (ownCandidates.length > 0) {
    const candidateIds = ownCandidates.map((c) => c.id);
    const referencingPosts = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(inArray(postsTable.candidateId, candidateIds));
    if (referencingPosts.length > 0) {
      return {
        ok: false,
        error: `Cannot delete — this run produced a candidate that was later drafted into a post (id ${referencingPosts[0].id}) by another run. Delete that post first.`,
      };
    }
  }

  await db.delete(llmCallsTable).where(eq(llmCallsTable.runId, id));
  if (ownCandidates.length > 0) {
    await db.delete(candidatesTable).where(eq(candidatesTable.runId, id));
  }
  await db.delete(pipelineRunsTable).where(eq(pipelineRunsTable.id, id));
  return { ok: true };
}
