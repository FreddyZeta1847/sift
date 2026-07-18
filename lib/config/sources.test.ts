import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSources, saveSources } from "./sources";
import { SEED_SOURCES } from "./seed-sources";

const testConfigDir = "data/test-config-sources";

describe("getSources", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("seeds the starter source list by default", async () => {
    const result = await getSources();
    expect(result).toEqual(SEED_SOURCES);
  });
});

describe("saveSources", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("saveSources writes the given list", async () => {
    const custom = [{ name: "Custom", url: "https://custom.test/feed", category: "ai-ml", enabled: true }];
    await saveSources(custom);
    const result = await getSources();
    expect(result).toEqual(custom);
  });
});
