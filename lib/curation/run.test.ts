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
    // Two picks from two DIFFERENT sources — the diversity filter (see
    // below) would otherwise collapse two same-source picks down to one,
    // which isn't what this test is checking.
    const otherSourceId = await seedEnabledSource("Other Source");
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Test Source", url: "https://source.test/feed", category: "general-tech", enabled: true },
      { name: "Other Source", url: "https://other.test/feed", category: "general-tech", enabled: true },
    ]);
    const [otherRow] = await db
      .insert(candidatesTable)
      .values({ runId, url: "https://a.test/4", sourceRecap: "Item D", sourceId: otherSourceId, chosen: false, createdAt: new Date() })
      .returning();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    const itemA = rows.find((r) => r.sourceRecap === "Item A")!;

    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ selected: [{ id: String(itemA.id), whyPicked: "relevant" }, { id: String(otherRow.id), whyPicked: "also relevant" }] }),
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.whyPicked)).toEqual(["relevant", "also relevant"]);
    const updated = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    expect(updated.filter((r) => r.chosen)).toHaveLength(2);
  });

  it("keeps only the first pick from a repeated source, deterministically, even though the model ranked both highly", async () => {
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    // All 3 beforeEach candidates share the same source — a perfect case
    // for the diversity filter to prove it caps at one pick per source.
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({
        selected: [
          { id: String(rows[0].id), whyPicked: "best" },
          { id: String(rows[1].id), whyPicked: "second best, same source" },
        ],
      }),
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toHaveLength(1);
    expect(result[0].whyPicked).toBe("best");
    const updated = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    expect(updated.filter((r) => r.chosen)).toHaveLength(1);
    expect(updated.find((r) => r.id === rows[0].id)?.chosen).toBe(true);
    expect(updated.find((r) => r.id === rows[1].id)?.chosen).toBe(false);
  });

  it("throws when every selected id is hallucinated (matches no real candidate) instead of silently returning nothing", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ selected: [{ id: "999999", whyPicked: "hallucinated" }] }),
      inputTokens: 500, outputTokens: 50,
    });

    await expect(runCuration(runId)).rejects.toThrow(/none matched a real candidate id/);
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    expect(rows.every((r) => !r.chosen)).toBe(true);
  });

  it("drops a hallucinated id but still succeeds when at least one other selected id is real", async () => {
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({
        selected: [
          { id: "999999", whyPicked: "hallucinated" },
          { id: String(rows[0].id), whyPicked: "real pick" },
        ],
      }),
      inputTokens: 500, outputTokens: 50,
    });

    const result = await runCuration(runId);

    expect(result).toHaveLength(1);
    expect(result[0].whyPicked).toBe("real pick");
  });

  it("returns an empty result without throwing when the model legitimately selects nothing", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ selected: [] }),
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

  it("throws on unparseable content instead of silently returning an empty result", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: "not json at all",
      inputTokens: 500, outputTokens: 50,
    });

    await expect(runCuration(runId)).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the parsed response is missing a \"selected\" array", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ notSelected: [] }),
      inputTokens: 500, outputTokens: 50,
    });

    await expect(runCuration(runId)).rejects.toThrow(/missing a "selected" array/);
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
    const [row] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, runId));
    expect(row.currentStage).toBe("Curating 0 candidate(s)…");
  });

  it("writes currentStage with the whole eligible pool size, including backlog from an earlier run — not just candidates ingested by this run", async () => {
    const db = getDb();
    const [earlierRun] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values({
      runId: earlierRun.id,
      url: "https://a.test/backlog",
      sourceRecap: "Backlog item from an earlier run",
      sourceId,
      chosen: false,
      createdAt: new Date(),
    });
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ selected: [] }),
      inputTokens: 10,
      outputTokens: 10,
    });

    await runCuration(runId);

    // 3 candidates seeded in beforeEach (all under `runId`) + 1 backlog
    // item under a different, earlier run = 4 total eligible for curation.
    const [row] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, runId));
    expect(row.currentStage).toBe("Curating 4 candidate(s)…");
  });

  it("writes currentStage: 'Curating 0 candidate(s)…' when every source is disabled, without querying candidates", async () => {
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Test Source", url: "https://source.test/feed", category: "general-tech", enabled: false },
    ]);

    await runCuration(runId);

    const db = getDb();
    const [row] = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, runId));
    expect(row.currentStage).toBe("Curating 0 candidate(s)…");
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

  it("scales the requested shortlist with settings.curationTopN (5x, capped by pool size) instead of a hardcoded number", async () => {
    const db = getDb();
    // A large enough pool that the shortlist is driven by curationTopN * 5,
    // not clamped down to the pool's own size — proves topN actually flows
    // through to the prompt rather than a hardcoded shortlist size.
    await db.insert(candidatesTable).values(
      Array.from({ length: 20 }, (_, i) => ({
        runId, url: `https://a.test/extra-${i}`, sourceRecap: `Extra ${i}`, sourceId, chosen: false, createdAt: new Date(),
      }))
    );
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null, scheduleDays: [], scheduleTime: "09:00", voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: "p1", curationModel: "gpt-4o-mini", draftingProviderId: "p1", draftingModel: "gpt-4o-mini",
      curationTopN: 2,
    });
    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      expect(prompt).toContain("up to 10"); // 2 * 5, well under the 23-item pool
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

  it("balances the guarded pool across sources so a prolific source can't crowd out a smaller one entirely", async () => {
    const db = getDb();
    const smallSourceId = await seedEnabledSource("Small Source");
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Test Source", url: "https://source.test/feed", category: "general-tech", enabled: true },
      { name: "Small Source", url: "https://small.test/feed", category: "general-tech", enabled: true },
    ]);
    // "Test Source" ends up with 43 candidates (3 from beforeEach + 40
    // more) vs. "Small Source"'s 3 — well past INPUT_GUARD_LIMIT (40)
    // combined, and heavily lopsided toward one source.
    await db.insert(candidatesTable).values(
      Array.from({ length: 40 }, (_, i) => ({
        runId, url: `https://a.test/bulk-${i}`, sourceRecap: `Bulk ${i}`, sourceId, chosen: false, createdAt: new Date(),
      }))
    );
    await db.insert(candidatesTable).values(
      Array.from({ length: 3 }, (_, i) => ({
        runId, url: `https://small.test/${i}`, sourceRecap: `Small Item ${i}`, sourceId: smallSourceId, chosen: false, createdAt: new Date(),
      }))
    );

    vi.spyOn(providerModule, "callLLM").mockImplementation(async (_p, _m, messages) => {
      const prompt = messages.map((m) => m.content).join(" ");
      // All 3 "Small Source" items survive the guard — a plain oldest-40
      // truncation would have buried them under "Test Source"'s 43.
      expect(prompt).toContain("Small Item 0");
      expect(prompt).toContain("Small Item 1");
      expect(prompt).toContain("Small Item 2");
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
