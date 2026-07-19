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
import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { pipelineRunsTable, postsTable } from "../db/schema";

export type PostRow = typeof postsTable.$inferSelect;
export interface PostWithPending extends PostRow {
  pendingVersion?: PostRow;
}

export type RunRow = typeof pipelineRunsTable.$inferSelect;
export interface RunSummary extends RunRow {
  postCount: number;
}

// Backs the Review page's run picker — every run in reverse-chronological
// order (not scoped to "today"), including ones that never finished
// (status null) or aborted, so a crashed/stuck run is something the user
// can actually see and inspect rather than a silent gap. Nothing in this
// app currently deletes a pipeline_runs row or its posts once written (see
// lib/candidates/retention.ts's docstring — post/run retention by count is
// a stored setting with no enforcement code yet), so every run that ever
// ran real ingestion/curation/drafting work stays browsable here.
export async function getRecentRuns(limit = 50): Promise<RunSummary[]> {
  const db = getDb();
  const runs = await db.select().from(pipelineRunsTable).orderBy(desc(pipelineRunsTable.id)).limit(limit);
  if (runs.length === 0) return [];

  const runIds = runs.map((r) => r.id);
  const counts = await db
    .select({ runId: postsTable.runId, postCount: count(postsTable.id) })
    .from(postsTable)
    .where(inArray(postsTable.runId, runIds))
    .groupBy(postsTable.runId);
  const countByRunId = new Map(counts.map((c) => [c.runId, Number(c.postCount)]));

  return runs.map((r) => ({ ...r, postCount: countByRunId.get(r.id) ?? 0 }));
}

export async function resolveRunIdForDate(date: string): Promise<number | null> {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const db = getDb();
  const runs = await db
    .select({ id: pipelineRunsTable.id, status: pipelineRunsTable.status })
    .from(pipelineRunsTable)
    .where(and(gte(pipelineRunsTable.startedAt, dayStart), lt(pipelineRunsTable.startedAt, dayEnd)))
    .orderBy(desc(pipelineRunsTable.id));

  if (runs.length === 0) return null;

  // Prefer the latest *successful* run over a later still-running/aborted
  // one — a run that never finishes (e.g. a hung LLM call, or a second run
  // that started while another was still in flight) must never mask an
  // earlier run's real posts just because it has a higher id. Falls back to
  // the plain latest run if none succeeded, so a genuinely-in-progress or
  // aborted run still surfaces (e.g. to show "no posts" rather than posts
  // from days ago).
  const latestSuccess = runs.find((r) => r.status === "success");
  return (latestSuccess ?? runs[0]).id;
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
