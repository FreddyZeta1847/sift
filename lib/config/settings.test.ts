import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSettings } from "./settings";

const testConfigDir = "data/test-config-settings";

describe("getSettings", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
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
