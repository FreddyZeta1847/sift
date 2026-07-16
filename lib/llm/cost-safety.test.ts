import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, unlinkSync } from "node:fs";
import { eq } from "drizzle-orm";
import { costOf } from "./pricing";
import { getDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, llmCallsTable } from "../db/schema";

const testDbPath = "data/test-cost-safety.db";

describe("cost-safety", () => {
  let runId: number;

  beforeEach(async () => {
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
    delete process.env.SIFT_DB_PATH;
    vi.resetModules();
    // Give time for file locks to release
    await new Promise(resolve => setTimeout(resolve, 50));
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = testDbPath + suffix;
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch (err) {
          // Ignore, file may still be locked
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
