// app/admin/actions.test.ts
/**
 * Thin — deleteRunAction/deleteCandidateAction/deletePostAction/
 * deleteLlmCallAction are pure pass-throughs to lib/admin/delete.ts, whose
 * own test suite (lib/admin/delete.test.ts) covers the actual
 * integrity/cascade logic in full. This file only proves each action is
 * wired to the right underlying function and that success/failure is
 * surfaced unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { deleteRunAction, deleteCandidateAction, deletePostAction, deleteLlmCallAction } from "./actions";
import { getDb, closeDb } from "../../lib/db/client";
import { runMigrations } from "../../lib/db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable } from "../../lib/db/schema";

const testDbPath = "data/test-admin-actions.db";

describe("admin actions", () => {
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

  it("deleteLlmCallAction removes the row", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [call] = await db
      .insert(llmCallsTable)
      .values({ timestamp: new Date(), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 0 })
      .returning({ id: llmCallsTable.id });

    const result = await deleteLlmCallAction(call.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(llmCallsTable)).toHaveLength(0);
  });

  it("deletePostAction removes the row", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    const [post] = await db
      .insert(postsTable)
      .values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p" })
      .returning({ id: postsTable.id });

    const result = await deletePostAction(post.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(postsTable)).toHaveLength(0);
  });

  it("deleteCandidateAction surfaces the block error unchanged when referenced", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p" });

    const result = await deleteCandidateAction(candidate.id);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("associated post");
  });

  it("deleteRunAction removes a clean run", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });

    const result = await deleteRunAction(run.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(pipelineRunsTable)).toHaveLength(0);
  });
});
