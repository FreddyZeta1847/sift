/**
 * Tests for `getMonthlySpend`, `getDailySpendForMonth`, and `getSpendByModel`
 * (lib/config/cost-history.ts).
 *
 * Verifies the UTC-calendar-month sum of `llm_calls.estimated_cost`, using
 * the same isolated-test-db pattern as other `lib/db`-touching tests in this
 * project (dedicated SQLite file via `SIFT_DB_PATH`, migrated fresh per
 * test, torn down after).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getMonthlySpend, getDailySpendForMonth, getSpendByModel } from "./cost-history";
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

describe("getDailySpendForMonth", () => {
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

  it("buckets cost by UTC day-of-month, one entry per day of the month", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(llmCallsTable).values([
      { timestamp: new Date("2026-07-05T12:00:00.000Z"), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 0.5 },
      { timestamp: new Date("2026-07-05T23:00:00.000Z"), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 0.25 },
      { timestamp: new Date("2026-07-20T12:00:00.000Z"), runId: run.id, provider: "p", model: "m", inputTokens: 1, outputTokens: 1, estimatedCost: 1.5 },
    ]);

    const daily = await getDailySpendForMonth("2026-07");

    expect(daily).toHaveLength(31);
    expect(daily[4]).toEqual({ day: 5, cost: 0.75 });
    expect(daily[19]).toEqual({ day: 20, cost: 1.5 });
    expect(daily[0]).toEqual({ day: 1, cost: 0 });
  });
});

describe("getSpendByModel", () => {
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

  it("groups cost and call count by provider+model, sorted by cost descending", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(llmCallsTable).values([
      { timestamp: new Date("2026-07-05T12:00:00.000Z"), runId: run.id, provider: "p1", model: "small", inputTokens: 1, outputTokens: 1, estimatedCost: 0.1 },
      { timestamp: new Date("2026-07-06T12:00:00.000Z"), runId: run.id, provider: "p1", model: "small", inputTokens: 1, outputTokens: 1, estimatedCost: 0.2 },
      { timestamp: new Date("2026-07-07T12:00:00.000Z"), runId: run.id, provider: "p2", model: "big", inputTokens: 1, outputTokens: 1, estimatedCost: 5 },
    ]);

    const byModel = await getSpendByModel("2026-07");

    expect(byModel).toEqual([
      { provider: "p2", model: "big", cost: 5, calls: 1 },
      { provider: "p1", model: "small", cost: 0.3, calls: 2 },
    ]);
  });

  it("returns an empty array for a month with no calls", async () => {
    expect(await getSpendByModel("2020-01")).toEqual([]);
  });
});
