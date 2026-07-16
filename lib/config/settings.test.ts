import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSettings } from "./settings";

describe("getSettings", () => {
  afterEach(() => {
    if (existsSync("config")) rmSync("config", { recursive: true, force: true });
  });

  it("returns blank defaults by default", async () => {
    const result = await getSettings();
    expect(result.budgetCapUsd).toBeNull();
    expect(result.postsRetentionRuns).toBeNull();
    expect(result.scheduleDays).toEqual([]);
    expect(result.voiceProfile).toEqual({ toneNotes: "", examplePosts: [], interests: [] });
    expect(result.curationProviderId).toBeNull();
    expect(result.draftingProviderId).toBeNull();
  });
});
