import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { runCuration } from "./run";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, sourcesTable } from "../db/schema";
import * as providerModule from "../llm/provider";
import * as costSafetyModule from "../llm/cost-safety";
import * as settingsModule from "../config/settings";
import * as providersModule from "../config/providers";
import * as configSourcesModule from "../config/sources";

const testDbPath = "data/test-curation-run.db";

// Seeds one enabled source row + mocks getSources to report it as enabled —
// every test needs this now that runCuration filters the pool by enabled
// source ids (see lib/db/sources.ts's getEnabledSourceIds). Returns the
// new sourcesTable id so callers can stamp it onto their own seeded
// candidates.
async function seedEnabledSource(name = "Test Source"): Promise<number> {
  const db = getDb();
  const [row] = await db.insert(sourcesTable).values({ name }).returning({ id: sourcesTable.id });
  vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
    { name, url: "https://source.test/feed", category: "general-tech", enabled: true },
  ]);
  return row.id;
}

describe("runCuration", () => {
  let runId: number;
  let sourceId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    runId = run.id;
    sourceId = await seedEnabledSource();
    await db.insert(candidatesTable).values([
      { runId, url: "https://a.test/1", sourceRecap: "Item A", sourceId, chosen: false, createdAt: new Date() },
      { runId, url: "https://a.test/2", sourceRecap: "Item B", sourceId, chosen: false, createdAt: new Date() },
      { runId, url: "https://a.test/3", sourceRecap: "Item C", sourceId, chosen: false, createdAt: new Date() },
    ]);

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null, scheduleDays: [], scheduleTime: "09:00", voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: "p1", curationModel: "gpt-4o-mini", draftingProviderId: "p1", draftingModel: "gpt-4o-mini",
      curationTopN: 3,
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

  it("skips the LLM call entirely when the candidate pool is empty", async () => {
    const db = getDb();
    await db.delete(candidatesTable).where(eq(candidatesTable.runId, runId));
    const callSpy = vi.spyOn(providerModule, "callLLM");
    const budgetSpy = vi.spyOn(costSafetyModule, "assertBudgetAvailable");

    const result = await runCuration(runId);

    expect(result).toEqual([]);
    expect(callSpy).not.toHaveBeenCalled();
    expect(budgetSpy).not.toHaveBeenCalled();
  });

  it("excludes already-chosen candidates from the pool", async () => {
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    await db.update(candidatesTable).set({ chosen: true }).where(eq(candidatesTable.id, rows[0].id));

    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).not.toContain(rows[0].sourceRecap);
      return { content: JSON.stringify({ selected: [] }), inputTokens: 10, outputTokens: 5 };
    });

    await runCuration(runId);
  });

  it("uses settings.curationTopN as the pick ceiling instead of a hardcoded number", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null, scheduleDays: [], scheduleTime: "09:00", voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: "p1", curationModel: "gpt-4o-mini", draftingProviderId: "p1", draftingModel: "gpt-4o-mini",
      curationTopN: 7,
    });
    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).toContain("up to 7");
      return { content: JSON.stringify({ selected: [] }), inputTokens: 10, outputTokens: 5 };
    });

    await runCuration(runId);
  });

  it("includes unchosen candidates ingested by an earlier run, not just this run's own", async () => {
    const db = getDb();
    const [earlierRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values({
      runId: earlierRun.id,
      url: "https://orphan.test/1",
      sourceRecap: "Orphaned Item",
      sourceId,
      chosen: false,
      createdAt: new Date(),
    });

    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).toContain("Orphaned Item");
      return { content: JSON.stringify({ selected: [] }), inputTokens: 10, outputTokens: 5 };
    });

    await runCuration(runId);
  });

  it("excludes a stale candidate whose source has since been disabled, even though chosen=false", async () => {
    const db = getDb();
    const disabledSourceId = await seedEnabledSource("Disabled Source"); // seeded enabled, then flipped below
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Test Source", url: "https://source.test/feed", category: "general-tech", enabled: true },
      { name: "Disabled Source", url: "https://disabled.test/feed", category: "general-tech", enabled: false },
    ]);
    await db.insert(candidatesTable).values({
      runId,
      url: "https://stale.test/1",
      sourceRecap: "Stale Item",
      sourceId: disabledSourceId,
      chosen: false,
      createdAt: new Date(),
    });

    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).not.toContain("Stale Item");
      return { content: JSON.stringify({ selected: [] }), inputTokens: 10, outputTokens: 5 };
    });

    await runCuration(runId);
  });

  it("excludes a legacy candidate with sourceId = null even when other sources are enabled", async () => {
    const db = getDb();
    await db.insert(candidatesTable).values({
      runId,
      url: "https://legacy.test/1",
      sourceRecap: "Legacy Item",
      sourceId: null,
      chosen: false,
      createdAt: new Date(),
    });

    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).not.toContain("Legacy Item");
      return { content: JSON.stringify({ selected: [] }), inputTokens: 10, outputTokens: 5 };
    });

    await runCuration(runId);
  });

  it("returns an empty result without querying candidates when every source is disabled", async () => {
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Test Source", url: "https://source.test/feed", category: "general-tech", enabled: false },
    ]);
    const callSpy = vi.spyOn(providerModule, "callLLM");

    const result = await runCuration(runId);

    expect(result).toEqual([]);
    expect(callSpy).not.toHaveBeenCalled();
  });
});
