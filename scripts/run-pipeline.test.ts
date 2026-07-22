// scripts/run-pipeline.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { runPipeline, abortOrphanedRuns } from "./run-pipeline";
import { getDb, closeDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable } from "../lib/db/schema";
import * as ingestionModule from "../lib/ingestion/run";
import * as curationModule from "../lib/curation/run";
import * as draftModule from "../lib/draft/run";
import * as sourcesModule from "../lib/config/sources";
import * as retentionModule from "../lib/candidates/retention";
import * as postsRetentionModule from "../lib/posts/retention";
import { BudgetCapAbort } from "../lib/llm/cost-safety";

const testDbPath = "data/test-run-pipeline.db";

describe("runPipeline", () => {
  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    vi.spyOn(sourcesModule, "getSources").mockResolvedValue([]);
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("creates a pipeline_runs row, prunes stale candidates, runs all three stages in order, marks success, and logs progress", async () => {
    const pruneSpy = vi.spyOn(retentionModule, "pruneStaleCandidates").mockResolvedValue({ deleted: 0 });
    const prunePostsSpy = vi.spyOn(postsRetentionModule, "pruneStalePosts").mockResolvedValue({ deleted: 0 });
    const ingestionSpy = vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({
      fetched: 5,
      written: 5,
      skippedSources: [],
      perSource: [{ source: "Hacker News", fetched: 5, written: 5 }],
    });
    const curationSpy = vi.spyOn(curationModule, "runCuration").mockResolvedValue([{ id: 1, url: "https://example.test/a", sourceRecap: "r", whyPicked: "w" }]);
    const draftSpy = vi.spyOn(draftModule, "runDraftGenerator").mockResolvedValue({ written: 1 });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runPipeline("manual");

    expect(pruneSpy).toHaveBeenCalled();
    expect(prunePostsSpy).toHaveBeenCalled();
    expect(ingestionSpy).toHaveBeenCalled();
    expect(curationSpy).toHaveBeenCalled();
    expect(draftSpy).toHaveBeenCalled();
    expect(result).toEqual({ status: "success" });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("5 new candidate(s)"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Hacker News: 5 new / 5 fetched"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("chose 1 topic(s)"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("https://example.test/a"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("wrote 1 post(s)"));

    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.type).toBe("manual");
    expect(run.status).toBe("success");
    expect(run.finishedAt).not.toBeNull();
    expect(run.currentStage).toBeNull();
  });

  it("marks the run aborted with reason budget_cap when a stage throws BudgetCapAbort", async () => {
    vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 0, written: 0, skippedSources: [], perSource: [] });
    vi.spyOn(curationModule, "runCuration").mockRejectedValue(new BudgetCapAbort());
    const draftSpy = vi.spyOn(draftModule, "runDraftGenerator");
    const prunePostsSpy = vi.spyOn(postsRetentionModule, "pruneStalePosts").mockResolvedValue({ deleted: 0 });

    const result = await runPipeline("manual");

    expect(draftSpy).not.toHaveBeenCalled();
    expect(prunePostsSpy).toHaveBeenCalled();
    expect(result).toEqual({ status: "aborted", abortReason: "budget_cap" });
    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("aborted");
    expect(run.abortReason).toBe("budget_cap");
    expect(run.currentStage).toBeNull();
  });

  it("marks the run aborted with reason api_error on any other stage failure, and logs the real error", async () => {
    vi.spyOn(ingestionModule, "runIngestion").mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prunePostsSpy = vi.spyOn(postsRetentionModule, "pruneStalePosts").mockResolvedValue({ deleted: 0 });

    const result = await runPipeline("manual");

    expect(prunePostsSpy).toHaveBeenCalled();
    expect(result).toEqual({ status: "aborted", abortReason: "api_error" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network down"));
    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("aborted");
    expect(run.abortReason).toBe("api_error");
    expect(run.errorMessage).toBe("network down");
  });

  it("skips drafting when curation returns zero items, still marks success", async () => {
    vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 3, written: 3, skippedSources: [], perSource: [] });
    vi.spyOn(curationModule, "runCuration").mockResolvedValue([]);
    const draftSpy = vi.spyOn(draftModule, "runDraftGenerator");

    await runPipeline("manual");

    expect(draftSpy).not.toHaveBeenCalled();
    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("success");
  });
});

describe("runPipeline — fresh, never-migrated database", () => {
  const freshDbPath = "data/test-run-pipeline-fresh.db";

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(freshDbPath + suffix)) rmSync(freshDbPath + suffix);
    }
  });

  it("runs migrations itself against a fresh data/ directory, without a manual db:migrate step first", async () => {
    process.env.SIFT_DB_PATH = freshDbPath;
    // Deliberately do NOT call runMigrations() here — this reproduces the
    // real bug (a fresh clone / fresh Docker volume with no prior migration)
    // and proves runPipeline's own internal call is what makes this work.
    expect(existsSync(freshDbPath)).toBe(false);
    vi.spyOn(sourcesModule, "getSources").mockResolvedValue([]);
    vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 0, written: 0, skippedSources: [], perSource: [] });
    vi.spyOn(curationModule, "runCuration").mockResolvedValue([]);

    await runPipeline("manual");

    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("success");
  });
});

describe("abortOrphanedRuns", () => {
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

  it("marks a run with no finishedAt as aborted (server_restart), clearing currentStage", async () => {
    const db = getDb();
    const [orphaned] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual", currentStage: "Curating 12 candidate(s)…" })
      .returning({ id: pipelineRunsTable.id });

    const result = await abortOrphanedRuns();

    expect(result).toEqual({ aborted: 1 });
    const [row] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, orphaned.id));
    expect(row.status).toBe("aborted");
    expect(row.abortReason).toBe("server_restart");
    expect(row.currentStage).toBeNull();
    expect(row.finishedAt).not.toBeNull();
  });

  it("leaves already-finished runs untouched", async () => {
    const db = getDb();
    const finishedAt = new Date("2026-07-18T08:05:00.000Z");
    const [finished] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date("2026-07-18T08:00:00.000Z"), type: "manual", status: "success", finishedAt })
      .returning({ id: pipelineRunsTable.id });

    const result = await abortOrphanedRuns();

    expect(result).toEqual({ aborted: 0 });
    const [row] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, finished.id));
    expect(row.status).toBe("success");
    expect(row.finishedAt).toEqual(finishedAt);
  });

  it("returns {aborted: 0} when there are no runs at all", async () => {
    expect(await abortOrphanedRuns()).toEqual({ aborted: 0 });
  });
});
