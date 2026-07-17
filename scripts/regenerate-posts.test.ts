// scripts/regenerate-posts.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { regeneratePosts } from "./regenerate-posts";
import { closeDb, getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../lib/db/schema";
import * as draftModule from "../lib/draft/run";

const testDbPath = "data/test-regenerate-posts.db";

describe("regeneratePosts", () => {
  let sourceRunId: number;
  let candidateIds: number[];

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [sourceRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    sourceRunId = sourceRun.id;

    const insertedCandidates = await db
      .insert(candidatesTable)
      .values([
        { runId: sourceRunId, url: "https://a.test/1", sourceRecap: "Item A", chosen: true, createdAt: new Date() },
        { runId: sourceRunId, url: "https://a.test/2", sourceRecap: "Item B", chosen: true, createdAt: new Date() },
      ])
      .returning({ id: candidatesTable.id });
    candidateIds = insertedCandidates.map((c) => c.id);

    await db.insert(postsTable).values(
      candidateIds.map((candidateId, i) => ({
        candidateId,
        runId: sourceRunId,
        url: `https://a.test/${i + 1}`,
        originalText: "old draft",
        imagePrompt: "old prompt",
      }))
    );
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("re-runs draft generation on the same candidates under a new regenerate-posts run", async () => {
    const draftSpy = vi
      .spyOn(draftModule, "runDraftGenerator")
      .mockResolvedValue({ written: 2 });

    const result = await regeneratePosts(sourceRunId);

    expect(result).toEqual({ status: "success" });
    const [items, newRunId] = draftSpy.mock.calls[0];
    expect(items.map((i) => i.id).sort()).toEqual([...candidateIds].sort());
    expect(newRunId).not.toBe(sourceRunId);

    const db = getDb();
    const runs = await db.select().from(pipelineRunsTable);
    const newRun = runs.find((r) => r.id === newRunId)!;
    expect(newRun.type).toBe("regenerate-posts");
    expect(newRun.status).toBe("success");
  });

  it("throws when the source run has no posts to regenerate from", async () => {
    const db = getDb();
    const [emptyRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });

    await expect(regeneratePosts(emptyRun.id)).rejects.toThrow(/no posts/i);
  });

  it("marks the new run aborted with the real error message on failure", async () => {
    vi.spyOn(draftModule, "runDraftGenerator").mockRejectedValue(new Error("model unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await regeneratePosts(sourceRunId);

    expect(result).toEqual({ status: "aborted", abortReason: "api_error" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("model unavailable"));
  });
});
