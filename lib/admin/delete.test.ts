// lib/admin/delete.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { deleteLlmCall, deletePost, deleteCandidate, deleteRun } from "./delete";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable } from "../db/schema";

const testDbPath = "data/test-admin-delete.db";

describe("admin delete", () => {
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

  it("deleteLlmCall always succeeds and removes the row", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [call] = await db
      .insert(llmCallsTable)
      .values({ timestamp: new Date(), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 0 })
      .returning({ id: llmCallsTable.id });

    const result = await deleteLlmCall(call.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(llmCallsTable)).toHaveLength(0);
  });

  it("deletePost always succeeds and removes the row", async () => {
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

    const result = await deletePost(post.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(postsTable)).toHaveLength(0);
  });

  it("deleteCandidate succeeds when no post references it", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: false, createdAt: new Date() })
      .returning({ id: candidatesTable.id });

    const result = await deleteCandidate(candidate.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(candidatesTable)).toHaveLength(0);
  });

  it("deleteCandidate is blocked when a post references it", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p" });

    const result = await deleteCandidate(candidate.id);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("associated post");
    expect(await db.select().from(candidatesTable)).toHaveLength(1);
  });

  it("deleteRun cascades its own llm_calls and candidates when clean", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: false, createdAt: new Date() });
    await db.insert(llmCallsTable).values({ timestamp: new Date(), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 0 });

    const result = await deleteRun(run.id);

    expect(result).toEqual({ ok: true });
    expect(await db.select().from(pipelineRunsTable)).toHaveLength(0);
    expect(await db.select().from(candidatesTable)).toHaveLength(0);
    expect(await db.select().from(llmCallsTable)).toHaveLength(0);
  });

  it("deleteRun is blocked when the run has its own posts", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p" });

    const result = await deleteRun(run.id);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("post(s)");
    expect(await db.select().from(pipelineRunsTable)).toHaveLength(1);
  });

  it("deleteRun is blocked when a candidate it produced was later drafted into a post by a different run (cross-run backlog case)", async () => {
    const db = getDb();
    const [birthRun] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [laterRun] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: birthRun.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    // The post is tied to laterRun (curation didn't pick this candidate until a later run drained the backlog).
    await db.insert(postsTable).values({ candidateId: candidate.id, runId: laterRun.id, url: "https://a.test", originalText: "x", imagePrompt: "p" });

    const result = await deleteRun(birthRun.id);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("another run");
    const remainingRuns = await db.select().from(pipelineRunsTable);
    expect(remainingRuns.map((r) => r.id)).toContain(birthRun.id);
    expect(await db.select().from(candidatesTable)).toHaveLength(1);
  });
});
