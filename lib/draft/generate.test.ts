/**
 * Tests for generateDrafts() — the shared enrichment/LLM-call/parsing core
 * extracted from lib/draft/run.ts (Phase 3, Task 3).
 *
 * Confirms generateDrafts() resolves drafted entries against enriched items
 * without touching the database, mirroring the mocking patterns used in
 * lib/draft/run.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateDrafts } from "./generate";
import * as enrichModule from "./enrich";
import * as providerModule from "../llm/provider";
import * as costSafetyModule from "../llm/cost-safety";
import * as settingsModule from "../config/settings";
import * as providersModule from "../config/providers";
import type { CuratedItem } from "../curation/run";

describe("generateDrafts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns resolved drafts without writing to the database", async () => {
    const items: CuratedItem[] = [{ id: 1, url: "https://a.test", sourceRecap: "recap", whyPicked: "" }];
    vi.spyOn(enrichModule, "enrichWithArticleContent").mockResolvedValue({
      ...items[0],
      articleText: "full article text",
    });
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null, scheduleDays: [],
      scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: "p1", curationModel: "m", draftingProviderId: "p1", draftingModel: "m",
      curationTopN: 3,
    });
    vi.spyOn(providersModule, "getProviders").mockResolvedValue([
      { id: "p1", label: "Test", baseUrl: "https://x.test", apiKey: "k", kind: "openai-compatible" },
    ]);
    vi.spyOn(costSafetyModule, "assertBudgetAvailable").mockResolvedValue(undefined);
    vi.spyOn(costSafetyModule, "logLlmCall").mockResolvedValue(undefined);
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([{ id: "1", title: "a title", text: "draft text", imagePrompt: "a prompt" }]),
      inputTokens: 10,
      outputTokens: 5,
    });

    const result = await generateDrafts(items, 99);

    expect(result).toEqual([
      { candidateId: 1, url: "https://a.test", title: "a title", text: "draft text", imagePrompt: "a prompt" },
    ]);
  });

  const items: CuratedItem[] = [{ id: 1, url: "https://a.test", sourceRecap: "recap", whyPicked: "" }];

  function stubCommonMocks() {
    vi.spyOn(enrichModule, "enrichWithArticleContent").mockResolvedValue({
      ...items[0],
      articleText: "full article text",
    });
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null, scheduleDays: [],
      scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: "p1", curationModel: "m", draftingProviderId: "p1", draftingModel: "m",
      curationTopN: 3,
    });
    vi.spyOn(providersModule, "getProviders").mockResolvedValue([
      { id: "p1", label: "Test", baseUrl: "https://x.test", apiKey: "k", kind: "openai-compatible" },
    ]);
    vi.spyOn(costSafetyModule, "assertBudgetAvailable").mockResolvedValue(undefined);
    vi.spyOn(costSafetyModule, "logLlmCall").mockResolvedValue(undefined);
  }

  it("throws on unparseable content instead of silently returning an empty result", async () => {
    stubCommonMocks();
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({ content: "not json at all", inputTokens: 10, outputTokens: 5 });

    await expect(generateDrafts(items, 99)).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the parsed response isn't a JSON array", async () => {
    stubCommonMocks();
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify({ notAnArray: true }),
      inputTokens: 10,
      outputTokens: 5,
    });

    await expect(generateDrafts(items, 99)).rejects.toThrow(/not a JSON array/);
  });

  it("throws when every returned entry is invalid or matches no real item", async () => {
    stubCommonMocks();
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([{ id: "999999", title: "t", text: "x", imagePrompt: "p" }]),
      inputTokens: 10,
      outputTokens: 5,
    });

    await expect(generateDrafts(items, 99)).rejects.toThrow(/none matched a real item/);
  });

  it("drops an invalid entry but still succeeds when at least one other entry is valid", async () => {
    stubCommonMocks();
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: JSON.stringify([
        { id: "999999", title: "t", text: "x", imagePrompt: "p" },
        { id: "1", title: "real title", text: "real text", imagePrompt: "real prompt" },
      ]),
      inputTokens: 10,
      outputTokens: 5,
    });

    const result = await generateDrafts(items, 99);

    expect(result).toEqual([
      { candidateId: 1, url: "https://a.test", title: "real title", text: "real text", imagePrompt: "real prompt" },
    ]);
  });
});
