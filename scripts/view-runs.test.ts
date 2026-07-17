// scripts/view-runs.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { formatRuns } from "./view-runs";
import { getDb, closeDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable } from "../lib/db/schema";

const testDbPath = "data/test-view-runs.db";

describe("formatRuns", () => {
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

  it("reports no runs yet when the table is empty", async () => {
    const output = await formatRuns();
    expect(output).toBe("No pipeline runs yet. Run `npm run pipeline` first.");
  });

  it("shows success runs without an error line", async () => {
    const db = getDb();
    await db.insert(pipelineRunsTable).values({
      startedAt: new Date(),
      finishedAt: new Date(),
      status: "success",
      type: "manual",
    });

    const output = await formatRuns();

    expect(output).toContain("SUCCESS");
    expect(output).not.toContain("Reason:");
  });

  it("shows aborted runs with the abort reason and persisted error message", async () => {
    const db = getDb();
    await db.insert(pipelineRunsTable).values({
      startedAt: new Date(),
      finishedAt: new Date(),
      status: "aborted",
      abortReason: "api_error",
      errorMessage: "LLM call failed: returned 404: Function not found for account",
      type: "manual",
    });

    const output = await formatRuns();

    expect(output).toContain("ABORTED (api_error)");
    expect(output).toContain("Reason: LLM call failed: returned 404: Function not found for account");
  });
});
