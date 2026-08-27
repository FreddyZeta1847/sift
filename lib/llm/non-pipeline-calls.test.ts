/**
 * Tests for recording LLM calls that belong to no pipeline run.
 *
 * The point of this table is that these calls used to leave no trace at all,
 * so the tests care about two things: a row actually lands, and its cost is
 * resolved from the model registry the same way a pipeline call's is.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { nonPipelineLlmCallsTable } from "../db/schema";
import type { ModelEntry } from "../config/models";

const MODELS: ModelEntry[] = [
  { providerId: "openai", model: "gpt-4o", inputPer1M: 2.5, outputPer1M: 10.0 },
  { providerId: "ollama", model: "llama3.1:8b", inputPer1M: 0, outputPer1M: 0 },
];

let testDbPath: string;

describe("non-pipeline call recording", () => {
  beforeEach(() => {
    closeDb();
    testDbPath = `data/test-non-pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    vi.resetModules();
    vi.doMock("../config/models", () => ({ getModels: async () => MODELS }));
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.resetModules();
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = testDbPath + suffix;
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          // Best effort; the unique path stops a leftover bleeding into later tests.
        }
      }
    }
  });

  it("writes a row priced from the model registry", async () => {
    const { logNonPipelineCall } = await import("./non-pipeline-calls");
    await logNonPipelineCall({
      origin: "probe",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });

    const rows = await getDb().select().from(nonPipelineLlmCallsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].origin).toBe("probe");
    expect(rows[0].estimatedCost).toBeCloseTo(2.5 + 1.0, 5);
  });

  it("keeps probe and health-check spend separable", async () => {
    const { logNonPipelineCall } = await import("./non-pipeline-calls");
    await logNonPipelineCall({ origin: "probe", provider: "openai", model: "gpt-4o", inputTokens: 100, outputTokens: 10 });
    await logNonPipelineCall({
      origin: "health-check",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 10,
    });

    const rows = await getDb().select().from(nonPipelineLlmCallsTable);
    expect(rows.map((r) => r.origin).sort()).toEqual(["health-check", "probe"]);
  });

  it("records a local model at zero without treating it as unpriced", async () => {
    const { logNonPipelineCall } = await import("./non-pipeline-calls");
    await logNonPipelineCall({
      origin: "health-check",
      provider: "ollama",
      model: "llama3.1:8b",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    const rows = await getDb().select().from(nonPipelineLlmCallsTable);
    expect(rows[0].estimatedCost).toBe(0);
    expect(rows[0].inputTokens).toBe(1_000_000);
  });

  it("sums this period's spend", async () => {
    const { logNonPipelineCall, nonPipelineSpendSince } = await import("./non-pipeline-calls");
    await logNonPipelineCall({
      origin: "probe",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    await logNonPipelineCall({
      origin: "probe",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });

    expect(await nonPipelineSpendSince(new Date(Date.now() - 60_000))).toBeCloseTo(5.0, 5);
  });

  it("swallows a recording failure rather than failing the caller", async () => {
    // A probe's whole job is to answer a question the user asked. Failing to
    // book-keep what it cost must never turn that answer into an error.
    const { tryLogNonPipelineCall } = await import("./non-pipeline-calls");
    vi.spyOn(console, "error").mockImplementation(() => {});
    closeDb();
    process.env.SIFT_DB_PATH = "Z:/nonexistent-drive/nope.db";

    await expect(
      tryLogNonPipelineCall({ origin: "probe", provider: "openai", model: "gpt-4o", inputTokens: 1, outputTokens: 1 })
    ).resolves.toBeUndefined();

    process.env.SIFT_DB_PATH = testDbPath;
  });
});
