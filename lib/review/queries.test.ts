/**
 * Tests for lib/review/queries.ts — the review-page data layer.
 * Covers resolving a pipeline run from a date and pairing posts with
 * their pending (regenerated-but-unconfirmed) sibling by candidateId.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolveRunIdForDate, getPostsForRun } from "./queries";
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
});
