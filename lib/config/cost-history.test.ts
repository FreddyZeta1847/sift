/**
 * Tests for `getMonthlySpend` (lib/config/cost-history.ts).
 *
 * Verifies the UTC-calendar-month sum of `llm_calls.estimated_cost`, using
 * the same isolated-test-db pattern as other `lib/db`-touching tests in this
 * project (dedicated SQLite file via `SIFT_DB_PATH`, migrated fresh per
 * test, torn down after).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getMonthlySpend } from "./cost-history";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, llmCallsTable } from "../db/schema";

const testDbPath = "data/test-cost-history.db";

describe("getMonthlySpend", () => {
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

  it("sums estimatedCost for calls within the given month, in UTC", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(llmCallsTable).values([
      { timestamp: new Date("2026-07-05T12:00:00.000Z"), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 0.5 },
      { timestamp: new Date("2026-07-20T12:00:00.000Z"), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 1.5 },
      { timestamp: new Date("2026-06-30T23:59:59.000Z"), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 99 },
    ]);

    const total = await getMonthlySpend("2026-07");

    expect(total).toBe(2);
  });

  it("returns 0 for a month with no calls", async () => {
    expect(await getMonthlySpend("2020-01")).toBe(0);
  });
});
