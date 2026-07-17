// scripts/run-pipeline.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { runPipeline } from "./run-pipeline";
import { getDb, closeDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable } from "../lib/db/schema";
import * as ingestionModule from "../lib/ingestion/run";
import * as curationModule from "../lib/curation/run";
import * as draftModule from "../lib/draft/run";
import * as sourcesModule from "../lib/config/sources";
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

  it("creates a pipeline_runs row, runs all three stages in order, and marks success", async () => {
    const ingestionSpy = vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 5, written: 5, skippedSources: [] });
    const curationSpy = vi.spyOn(curationModule, "runCuration").mockResolvedValue([{ id: 1, url: "u", sourceRecap: "r", whyPicked: "w" }]);
    const draftSpy = vi.spyOn(draftModule, "runDraftGenerator").mockResolvedValue({ written: 1 });

    const result = await runPipeline("manual");

    expect(ingestionSpy).toHaveBeenCalled();
    expect(curationSpy).toHaveBeenCalled();
    expect(draftSpy).toHaveBeenCalled();
    expect(result).toEqual({ status: "success" });

    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.type).toBe("manual");
    expect(run.status).toBe("success");
    expect(run.finishedAt).not.toBeNull();
  });

  it("marks the run aborted with reason budget_cap when a stage throws BudgetCapAbort", async () => {
    vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 0, written: 0, skippedSources: [] });
    vi.spyOn(curationModule, "runCuration").mockRejectedValue(new BudgetCapAbort());
    const draftSpy = vi.spyOn(draftModule, "runDraftGenerator");

    const result = await runPipeline("manual");

    expect(draftSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "aborted", abortReason: "budget_cap" });
    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("aborted");
    expect(run.abortReason).toBe("budget_cap");
  });

  it("marks the run aborted with reason api_error on any other stage failure, and logs the real error", async () => {
    vi.spyOn(ingestionModule, "runIngestion").mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runPipeline("manual");

    expect(result).toEqual({ status: "aborted", abortReason: "api_error" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network down"));
    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("aborted");
    expect(run.abortReason).toBe("api_error");
  });

  it("skips drafting when curation returns zero items, still marks success", async () => {
    vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 3, written: 3, skippedSources: [] });
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
    vi.spyOn(ingestionModule, "runIngestion").mockResolvedValue({ fetched: 0, written: 0, skippedSources: [] });
    vi.spyOn(curationModule, "runCuration").mockResolvedValue([]);

    await runPipeline("manual");

    const db = getDb();
    const [run] = await db.select().from(pipelineRunsTable);
    expect(run.status).toBe("success");
  });
});
