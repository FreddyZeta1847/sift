import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, unlinkSync } from "node:fs";
import { eq } from "drizzle-orm";
import { costOf } from "./pricing";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, llmCallsTable } from "../db/schema";

describe("cost-safety", () => {
  let runId: number;
  let testDbPath: string;

  beforeEach(async () => {
    // Close any connection left over from a prior test (module-level
    // singleton in ../db/client) so getDb() opens a fresh one below, and
    // use a unique path per test to avoid cross-test data bleed from
    // connections opened by dynamically re-imported ("./cost-safety")
    // module instances, which this closeDb() call cannot reach.
    closeDb();
    testDbPath = `data/test-cost-safety-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    runId = run.id;
  });

  afterEach(async () => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.resetModules();
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = testDbPath + suffix;
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch (err) {
          // Best effort; the unique path means a leftover file here can't bleed into future tests.
        }
      }
    }
  });

  it("allows a call when under budget", async () => {
    vi.resetModules();
    vi.doMock("../config/settings", () => ({
      getSettings: async () => ({ budgetCapUsd: 10 }),
    }));
    const { assertBudgetAvailable: assertUnderMock, BudgetCapAbort: BudgetCapAbortMocked } = await import("./cost-safety");
    await expect(assertUnderMock("gpt-4o-mini", 1000, 500)).resolves.not.toThrow();
  });

  it("throws BudgetCapAbort when the upper-bound estimate would exceed the cap", async () => {
    vi.resetModules();
    vi.doMock("../config/settings", () => ({
      getSettings: async () => ({ budgetCapUsd: 0.0001 }),
    }));
    const { assertBudgetAvailable: assertOverMock, BudgetCapAbort: BudgetCapAbortMocked } = await import("./cost-safety");
    await expect(assertOverMock("gpt-4o", 1_000_000, 1_000_000)).rejects.toThrow(BudgetCapAbortMocked);
  });

  it("accumulates prior spend from logLlmCall when checking the budget cap", async () => {
    vi.resetModules();
    vi.doMock("../config/settings", () => ({
      getSettings: async () => ({ budgetCapUsd: 8.0 }),
    }));
    const {
      assertBudgetAvailable: assertAccum,
      logLlmCall: logAccum,
      BudgetCapAbort: BudgetCapAbortMocked,
    } = await import("./cost-safety");

    // Prior spend this month: gpt-4o, 1M input + 500K output tokens ≈ $7.50
    await logAccum({ runId, provider: "test-provider", model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 500_000 });

    // New call alone (~$0.75) is well under the $8 cap, but prior spend + new call (~$8.25) exceeds it.
    await expect(assertAccum("gpt-4o", 100_000, 50_000)).rejects.toThrow(BudgetCapAbortMocked);
  });

  it("does not throw when prior spend plus the new call's estimate stays under the cap", async () => {
    vi.resetModules();
    vi.doMock("../config/settings", () => ({
      getSettings: async () => ({ budgetCapUsd: 8.0 }),
    }));
    const { assertBudgetAvailable: assertAccumOk, logLlmCall: logAccumOk } = await import("./cost-safety");

    // Prior spend this month: gpt-4o, 1M input + 500K output tokens ≈ $7.50
    await logAccumOk({ runId, provider: "test-provider", model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 500_000 });

    // New call adds ~$0.075, so total (~$7.575) stays under the $8 cap.
    await expect(assertAccumOk("gpt-4o", 10_000, 5_000)).resolves.not.toThrow();
  });

  it("logLlmCall writes a row to llm_calls with the given runId", async () => {
    const { logLlmCall } = await import("./cost-safety");
    await logLlmCall({ runId, provider: "test-provider", model: "gpt-4o-mini", inputTokens: 100, outputTokens: 50 });
    const db = getDb();
    const rows = await db.select().from(llmCallsTable).where(eq(llmCallsTable.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("gpt-4o-mini");
    expect(rows[0].estimatedCost).toBeCloseTo(costOf("gpt-4o-mini", 100, "input") + costOf("gpt-4o-mini", 50, "output"), 6);
  });
});
