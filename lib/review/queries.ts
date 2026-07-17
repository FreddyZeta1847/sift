/**
 * Review-page data layer.
 *
 * Resolves a calendar date to the pipeline run that produced posts on it,
 * and loads that run's posts paired with their "pending" sibling — the
 * unconfirmed regenerated version created by a future Regenerate action
 * (see posts.pending, added in Task 1). A post with a pending sibling is
 * returned once, with the pending row attached as `pendingVersion`, so the
 * review page can render "current vs proposed" without duplicate cards.
 */
import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { pipelineRunsTable, postsTable } from "../db/schema";

export type PostRow = typeof postsTable.$inferSelect;
export interface PostWithPending extends PostRow {
  pendingVersion?: PostRow;
}

export async function resolveRunIdForDate(date: string): Promise<number | null> {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const db = getDb();
  const [run] = await db
    .select({ id: pipelineRunsTable.id })
    .from(pipelineRunsTable)
    .where(and(gte(pipelineRunsTable.startedAt, dayStart), lt(pipelineRunsTable.startedAt, dayEnd)))
    .orderBy(pipelineRunsTable.id)
    .limit(1);
  return run ? run.id : null;
}

export async function getPostsForRun(runId: number): Promise<PostWithPending[]> {
  const db = getDb();
  const rows = await db.select().from(postsTable).where(eq(postsTable.runId, runId));

  const byCandidate = new Map<number, PostRow[]>();
  for (const row of rows) {
    const list = byCandidate.get(row.candidateId) ?? [];
    list.push(row);
    byCandidate.set(row.candidateId, list);
  }

  const result: PostWithPending[] = [];
  for (const group of byCandidate.values()) {
    const original = group.find((r) => !r.pending) ?? group[0];
    const pendingVersion = group.find((r) => r.pending && r.id !== original.id);
    result.push(pendingVersion ? { ...original, pendingVersion } : original);
  }
  return result;
}
