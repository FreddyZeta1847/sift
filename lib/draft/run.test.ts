import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { runDraftGenerator } from "./run";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../db/schema";
import type { CuratedItem } from "../curation/run";
import * as enrichModule from "./enrich";
import * as providerModule from "../llm/provider";
import * as costSafetyModule from "../llm/cost-safety";
import * as settingsModule from "../config/settings";
import * as providersModule from "../config/providers";
import * as rateLimitModule from "../ingestion/rate-limit";

const testDbPath = "data/test-draft-run.db";

describe("runDraftGenerator", () => {
  let runId: number;
  let items: CuratedItem[];

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    runId = run.id;
    const inserted = await db
      .insert(candidatesTable)
      .values([{ runId, url: "https://a.test/1", sourceRecap: "Item A", chosen: true, createdAt: new Date() }])
      .returning({ id: candidatesTable.id, url: candidatesTable.url });
    items = [{ id: inserted[0].id, url: inserted[0].url, sourceRecap: "Item A", whyPicked: "relevant" }];

    vi.spyOn(enrichModule, "enrichWithArticleContent").mockImplementation(async (item) => ({ ...item, articleText: `enriched ${item.sourceRecap}` }));
    vi.spyOn(rateLimitModule, "delayBetweenFetches").mockResolvedValue(undefined);
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null, scheduleDays: [], scheduleTime: "09:00", voiceProfile: { toneNotes: "casual", examplePosts: [], interests: [] },
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

  it("writes one posts row per valid drafted entry", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([{ id: String(items[0].id), title: "A title", text: "Drafted post text", imagePrompt: "A robot writing" }]),
      inputTokens: 800, outputTokens: 200,
    });

    const result = await runDraftGenerator(items, runId);

    expect(result.written).toBe(1);
    const db = getDb();
    const rows = await db.select().from(postsTable).where(eq(postsTable.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0].candidateId).toBe(items[0].id);
    expect(rows[0].title).toBe("A title");
    expect(rows[0].originalText).toBe("Drafted post text");
    expect(rows[0].imagePrompt).toBe("A robot writing");
    expect(rows[0].discarded).toBe(false);
    expect(rows[0].posted).toBe(false);
  });

  it("drops a malformed single entry and keeps the rest of the batch", async () => {
    const db = getDb();
    const [second] = await db
      .insert(candidatesTable)
      .values({ runId, url: "https://a.test/2", sourceRecap: "Item B", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id, url: candidatesTable.url });
    const twoItems = [...items, { id: second.id, url: second.url, sourceRecap: "Item B", whyPicked: "relevant" }];

    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([
        { id: String(items[0].id), title: "Good title", text: "Good post", imagePrompt: "prompt" },
        { id: String(second.id) }, // missing title/text/imagePrompt — malformed
      ]),
      inputTokens: 800, outputTokens: 200,
    });

    const result = await runDraftGenerator(twoItems, runId);

    expect(result.written).toBe(1);
  });

  it("drops entries whose id doesn't resolve to a real item, including non-numeric ids that would NaN the insert", async () => {
    const db = getDb();
    const [second] = await db
      .insert(candidatesTable)
      .values({ runId, url: "https://a.test/2", sourceRecap: "Item B", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id, url: candidatesTable.url });
    const twoItems = [...items, { id: second.id, url: second.url, sourceRecap: "Item B", whyPicked: "relevant" }];

    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([
        { id: String(items[0].id), title: "Good title", text: "Good post", imagePrompt: "prompt" },
        { id: "item-3", title: "t", text: "Hallucinated non-numeric id", imagePrompt: "prompt" },
        { id: "9999999", title: "t", text: "Hallucinated numeric id", imagePrompt: "prompt" },
      ]),
      inputTokens: 800, outputTokens: 200,
    });

    const result = await runDraftGenerator(twoItems, runId);

    expect(result.written).toBe(1);
    const rows = await db.select().from(postsTable).where(eq(postsTable.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0].candidateId).toBe(items[0].id);
  });

  it("parses a code-fence-wrapped JSON response", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: "```json\n" + JSON.stringify([{ id: String(items[0].id), title: "A title", text: "Drafted post text", imagePrompt: "A robot writing" }]) + "\n```",
      inputTokens: 800, outputTokens: 200,
    });

    const result = await runDraftGenerator(items, runId);

    expect(result.written).toBe(1);
    const db = getDb();
    const rows = await db.select().from(postsTable).where(eq(postsTable.runId, runId));
    expect(rows[0].originalText).toBe("Drafted post text");
  });

  it("soft-degrades to written: 0 on unparseable content instead of throwing", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: "not json at all",
      inputTokens: 800, outputTokens: 200,
    });

    const result = await runDraftGenerator(items, runId);

    expect(result.written).toBe(0);
    const db = getDb();
    const rows = await db.select().from(postsTable).where(eq(postsTable.runId, runId));
    expect(rows).toHaveLength(0);
  });

  it("hard failure: propagates BudgetCapAbort and writes nothing", async () => {
    vi.spyOn(costSafetyModule, "assertBudgetAvailable").mockRejectedValue(new costSafetyModule.BudgetCapAbort());

    await expect(runDraftGenerator(items, runId)).rejects.toThrow(costSafetyModule.BudgetCapAbort);
    const db = getDb();
    const rows = await db.select().from(postsTable).where(eq(postsTable.runId, runId));
    expect(rows).toHaveLength(0);
  });

  it("makes exactly one batched LLM call regardless of item count", async () => {
    const db = getDb();
    const [second] = await db
      .insert(candidatesTable)
      .values({ runId, url: "https://a.test/2", sourceRecap: "Item B", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id, url: candidatesTable.url });
    const twoItems = [...items, { id: second.id, url: second.url, sourceRecap: "Item B", whyPicked: "relevant" }];
    const callSpy = vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([
        { id: String(items[0].id), title: "t1", text: "A", imagePrompt: "a" },
        { id: String(second.id), title: "t2", text: "B", imagePrompt: "b" },
      ]),
      inputTokens: 800, outputTokens: 200,
    });

    await runDraftGenerator(twoItems, runId);

    expect(callSpy).toHaveBeenCalledTimes(1);
  });
});
