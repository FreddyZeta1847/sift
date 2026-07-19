import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSettings, saveSettings } from "./settings";

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
    expect(result.candidateRetentionDays).toBeNull();
    expect(result.scheduleDays).toEqual([]);
    expect(result.scheduleTime).toBe("09:00");
    expect(result.voiceProfile).toEqual({ toneNotes: "", examplePosts: [], interests: [] });
    expect(result.curationProviderId).toBeNull();
    expect(result.draftingProviderId).toBeNull();
  });
});

describe("saveSettings", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("saveSettings writes the given settings", async () => {
    const custom = {
      budgetCapUsd: 10, postsRetentionRuns: 5, candidateRetentionDays: 7, scheduleDays: ["mon"],
      scheduleTime: "14:30",
      voiceProfile: { toneNotes: "casual", examplePosts: [], interests: ["ai"] },
      curationProviderId: "p1", curationModel: "m1", draftingProviderId: "p1", draftingModel: "m1",
      curationTopN: 5,
    };
    await saveSettings(custom);
    const result = await getSettings();
    expect(result).toEqual(custom);
  });
});
