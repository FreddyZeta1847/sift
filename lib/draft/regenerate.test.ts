import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { regeneratePost, keepVersion } from "./regenerate";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../db/schema";
import * as generateModule from "./generate";
import * as runGuardModule from "../pipeline/run-guard";

const testDbPath = "data/test-regenerate.db";

describe("regeneratePost", () => {
  let postId: number;
  let candidateId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    runGuardModule.clearRunning();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db.insert(candidatesTable).values({ runId: run.id, url: "https://a.test", sourceRecap: "recap", chosen: true, createdAt: new Date() }).returning({ id: candidatesTable.id });
    candidateId = candidate.id;
    const [post] = await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "old draft", imagePrompt: "old prompt" }).returning({ id: postsTable.id });
    postId = post.id;
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    runGuardModule.clearRunning();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("inserts a pending sibling row without touching the original", async () => {
    vi.spyOn(generateModule, "generateDrafts").mockResolvedValue([
      { candidateId, url: "https://a.test", title: "new title", text: "new draft", imagePrompt: "new prompt" },
    ]);

    const result = await regeneratePost(postId);

    expect(result.ok).toBe(true);
    const db = getDb();
    const rows = await db.select().from(postsTable).where(eq(postsTable.candidateId, candidateId));
    expect(rows).toHaveLength(2);
    const original = rows.find((r) => !r.pending)!;
    const pending = rows.find((r) => r.pending)!;
    expect(original.originalText).toBe("old draft");
    expect(pending.originalText).toBe("new draft");
  });

  it("creates a new pipeline_runs row tagged regenerate-posts", async () => {
    vi.spyOn(generateModule, "generateDrafts").mockResolvedValue([
      { candidateId, url: "https://a.test", title: "new title", text: "new draft", imagePrompt: "new prompt" },
    ]);

    await regeneratePost(postId);

    const db = getDb();
    const runs = await db.select().from(pipelineRunsTable);
    expect(runs.some((r) => r.type === "regenerate-posts")).toBe(true);
  });

  it("is a silent no-op if a run is already in progress", async () => {
    runGuardModule.checkAndSetRunning();
    const generateSpy = vi.spyOn(generateModule, "generateDrafts");

    const result = await regeneratePost(postId);

    expect(result).toEqual({ ok: false, error: "Already running" });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("clears the run guard even if generation throws", async () => {
    vi.spyOn(generateModule, "generateDrafts").mockRejectedValue(new Error("model unavailable"));

    const result = await regeneratePost(postId);

    expect(result.ok).toBe(false);
    expect(runGuardModule.checkAndSetRunning()).toBe(true); // guard was released
  });
});

describe("keepVersion", () => {
  let originalId: number;
  let pendingId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db.insert(candidatesTable).values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() }).returning({ id: candidatesTable.id });
    const [original] = await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "old", imagePrompt: "p1" }).returning({ id: postsTable.id });
    const [pending] = await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "new", imagePrompt: "p2", pending: true }).returning({ id: postsTable.id });
    originalId = original.id;
    pendingId = pending.id;
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("keeping the pending version deletes the original and clears pending", async () => {
    const result = await keepVersion(pendingId, originalId);

    expect(result.ok).toBe(true);
    const db = getDb();
    const rows = await db.select().from(postsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(pendingId);
    expect(rows[0].pending).toBe(false);
  });

  it("keeping the original deletes the pending version", async () => {
    const result = await keepVersion(originalId, pendingId);

    expect(result.ok).toBe(true);
    const db = getDb();
    const rows = await db.select().from(postsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(originalId);
    expect(rows[0].pending).toBe(false);
  });
});
