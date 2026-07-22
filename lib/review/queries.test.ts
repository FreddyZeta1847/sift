/**
 * Tests for lib/review/queries.ts — the review-page data layer.
 * Covers resolving a pipeline run from a date and pairing posts with
 * their pending (regenerated-but-unconfirmed) sibling by candidateId.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  resolveRunIdForDate,
  getPostsForRun,
  getRecentRuns,
  getMostRecentFinishedRun,
  getUndecidedPostCount,
  getInProgressRun,
} from "./queries";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../db/schema";

const testDbPath = "data/test-review-queries.db";

describe("review queries", () => {
  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("resolveRunIdForDate finds the run started on that date", async () => {
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T10:00:00.000Z"), type: "manual" })
      .returning({ id: pipelineRunsTable.id });

    const resolved = await resolveRunIdForDate("2026-07-18");

    expect(resolved).toBe(run.id);
  });

  it("resolveRunIdForDate returns null when no run matches", async () => {
    const resolved = await resolveRunIdForDate("2020-01-01");
    expect(resolved).toBeNull();
  });

  it("getPostsForRun pairs a pending row with its original by candidateId", async () => {
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values([
      { candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "old", imagePrompt: "p1", pending: false },
      { candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "new", imagePrompt: "p2", pending: true },
    ]);

    const rows = await getPostsForRun(run.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].originalText).toBe("old");
    expect(rows[0].pendingVersion?.originalText).toBe("new");
  });

  it("getPostsForRun returns posts with no pending sibling as-is", async () => {
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "only", imagePrompt: "p" });

    const rows = await getPostsForRun(run.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].pendingVersion).toBeUndefined();
  });

  it("resolveRunIdForDate returns the most recent run on the same date", async () => {
    const db = getDb();
    const [earlyRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T08:00:00.000Z"), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    const [lateRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T16:00:00.000Z"), type: "regenerate-posts" })
      .returning({ id: pipelineRunsTable.id });

    const resolved = await resolveRunIdForDate("2026-07-18");

    expect(resolved).toBe(lateRun.id);
  });

  it("resolveRunIdForDate prefers a successful run over a later stuck/aborted one on the same date", async () => {
    const db = getDb();
    const [successRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T08:00:00.000Z"), type: "manual", status: "success", finishedAt: new Date("2026-07-18T08:05:00.000Z") })
      .returning({ id: pipelineRunsTable.id });
    // A later run that never finished (status/finishedAt both null) — e.g. a
    // hung LLM call — must not mask the earlier successful run's posts just
    // because it has a higher id.
    await db.insert(pipelineRunsTable).values({ startedAt: new Date("2026-07-18T16:00:00.000Z"), type: "manual" });

    const resolved = await resolveRunIdForDate("2026-07-18");

    expect(resolved).toBe(successRun.id);
  });

  it("resolveRunIdForDate falls back to the latest run when none succeeded", async () => {
    const db = getDb();
    await db.insert(pipelineRunsTable).values({
      startedAt: new Date("2026-07-18T08:00:00.000Z"),
      type: "manual",
      status: "aborted",
      abortReason: "api_error",
      finishedAt: new Date("2026-07-18T08:01:00.000Z"),
    });
    const [lateRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T16:00:00.000Z"), type: "manual" })
      .returning({ id: pipelineRunsTable.id });

    const resolved = await resolveRunIdForDate("2026-07-18");

    expect(resolved).toBe(lateRun.id);
  });

  it("getRecentRuns returns runs newest-first with post counts, including runs with zero posts", async () => {
    const db = getDb();
    const [oldRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-17T10:00:00.000Z"), type: "manual", status: "success", finishedAt: new Date() })
      .returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: oldRun.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values({ candidateId: candidate.id, runId: oldRun.id, url: "https://a.test", originalText: "x", imagePrompt: "p" });
    // A run that never finished — must still appear, with postCount 0.
    const [stuckRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T10:00:00.000Z"), type: "manual" })
      .returning({ id: pipelineRunsTable.id });

    const runs = await getRecentRuns();

    expect(runs.map((r) => r.id)).toEqual([stuckRun.id, oldRun.id]);
    expect(runs[0].postCount).toBe(0);
    expect(runs[0].status).toBeNull();
    expect(runs[1].postCount).toBe(1);
  });

  it("getRecentRuns returns an empty array when there are no runs", async () => {
    expect(await getRecentRuns()).toEqual([]);
  });

  it("getMostRecentFinishedRun returns the latest successful run's finishedAt, ignoring a later aborted/stuck one", async () => {
    const db = getDb();
    const successFinishedAt = new Date("2026-07-18T08:05:00.000Z");
    await db.insert(pipelineRunsTable).values({
      startedAt: new Date("2026-07-18T08:00:00.000Z"),
      type: "manual",
      status: "success",
      finishedAt: successFinishedAt,
    });
    await db.insert(pipelineRunsTable).values({
      startedAt: new Date("2026-07-19T08:00:00.000Z"),
      type: "manual",
      status: "aborted",
      abortReason: "api_error",
      finishedAt: new Date("2026-07-19T08:01:00.000Z"),
    });

    const result = await getMostRecentFinishedRun();

    expect(result?.finishedAt).toEqual(successFinishedAt);
  });

  it("getMostRecentFinishedRun returns null when no run has ever succeeded", async () => {
    expect(await getMostRecentFinishedRun()).toBeNull();
  });

  it("getUndecidedPostCount counts only posts with no decision and no pending flag", async () => {
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values([
      { candidateId: candidate.id, runId: run.id, url: "https://a.test/1", originalText: "undecided", imagePrompt: "p" },
      { candidateId: candidate.id, runId: run.id, url: "https://a.test/2", originalText: "posted", imagePrompt: "p", posted: true },
      { candidateId: candidate.id, runId: run.id, url: "https://a.test/3", originalText: "discarded", imagePrompt: "p", discarded: true },
      { candidateId: candidate.id, runId: run.id, url: "https://a.test/4", originalText: "pending sibling", imagePrompt: "p", pending: true },
    ]);

    expect(await getUndecidedPostCount()).toBe(1);
  });

  it("getInProgressRun returns the row with no finishedAt, including its currentStage", async () => {
    const db = getDb();
    await db.insert(pipelineRunsTable).values({
      startedAt: new Date("2026-07-18T08:00:00.000Z"),
      type: "manual",
      status: "success",
      finishedAt: new Date("2026-07-18T08:05:00.000Z"),
    });
    const [inProgress] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual", currentStage: "Curating 12 candidate(s)…" })
      .returning({ id: pipelineRunsTable.id });

    const result = await getInProgressRun();

    expect(result).toEqual({ id: inProgress.id, currentStage: "Curating 12 candidate(s)…" });
  });

  it("getInProgressRun returns null when every run has finished", async () => {
    expect(await getInProgressRun()).toBeNull();
  });
});
