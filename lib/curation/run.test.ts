import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { runCuration } from "./run";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable } from "../db/schema";
import * as providerModule from "../llm/provider";
import * as costSafetyModule from "../llm/cost-safety";
import * as settingsModule from "../config/settings";
import * as providersModule from "../config/providers";

const testDbPath = "data/test-curation-run.db";

describe("runCuration", () => {
  let runId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    runId = run.id;
    await db.insert(candidatesTable).values([
      { runId, url: "https://a.test/1", sourceRecap: "Item A", chosen: false, createdAt: new Date() },
      { runId, url: "https://a.test/2", sourceRecap: "Item B", chosen: false, createdAt: new Date() },
      { runId, url: "https://a.test/3", sourceRecap: "Item C", chosen: false, createdAt: new Date() },
    ]);

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, scheduleDays: [], voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: "p1", curationModel: "gpt-4o-mini", draftingProviderId: "p1", draftingModel: "gpt-4o-mini",
    });
    vi.spyOn(providersModule, "getProviders").mockResolvedValue([
      { id: "p1", label: "Test", baseUrl: "https://x.test", apiKey: "k", kind: "openai-compatible" },
    ]);
    vi.spyOn(costSafetyModule, "assertBudgetAvailable").mockResolvedValue(undefined);
    vi.spyOn(costSafetyModule, "logLlmCall").mockResolvedValue(undefined);
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("resolves ids locally and marks chosen=true on picks", async () => {
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ selected: [{ id: String(rows[0].id), whyPicked: "relevant" }, { id: String(rows[1].id), whyPicked: "also relevant" }] }),
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.whyPicked)).toEqual(["relevant", "also relevant"]);
    const updated = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    expect(updated.filter((r) => r.chosen)).toHaveLength(2);
  });

  it("silently drops an id that doesn't match any local item (soft failure)", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ selected: [{ id: "999999", whyPicked: "hallucinated" }] }),
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toEqual([]);
  });

  it("hard failure: propagates BudgetCapAbort and marks nothing chosen", async () => {
    vi.spyOn(costSafetyModule, "assertBudgetAvailable").mockRejectedValue(new costSafetyModule.BudgetCapAbort());

    await expect(runCuration(runId)).rejects.toThrow(costSafetyModule.BudgetCapAbort);
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    expect(rows.every((r) => !r.chosen)).toBe(true);
  });

  it("parses a code-fence-wrapped JSON response", async () => {
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: "```json\n" + JSON.stringify({ selected: [{ id: String(rows[0].id), whyPicked: "relevant" }] }) + "\n```",
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toHaveLength(1);
    expect(result[0].whyPicked).toBe("relevant");
  });

  it("soft-degrades to an empty result on unparseable content instead of throwing", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: "not json at all",
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toEqual([]);
  });

  it("poolFilter='unchosen' scopes to WHERE chosen = false", async () => {
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    await db.update(candidatesTable).set({ chosen: true }).where(eq(candidatesTable.id, rows[0].id));

    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).not.toContain(rows[0].sourceRecap);
      return { content: JSON.stringify({ selected: [] }), inputTokens: 10, outputTokens: 5 };
    });

    await runCuration(runId, "unchosen");
  });
});
