import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { getProviders, saveProviders } from "./providers";
import { KNOWN_PROVIDERS } from "./known-providers";

const testConfigDir = "data/test-config-providers";

describe("getProviders", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("seeds every known provider (empty api key, ready to fill in) on a fresh install", async () => {
    const result = await getProviders();
    expect(result).toHaveLength(KNOWN_PROVIDERS.length);
    expect(result.every((p) => p.apiKey === "")).toBe(true);
    expect(result.map((p) => p.id).sort()).toEqual(KNOWN_PROVIDERS.map((p) => p.suggestedId).sort());
  });

  it("returns configured providers", async () => {
    mkdirSync(testConfigDir, { recursive: true });
    writeFileSync(
      `${testConfigDir}/providers.json`,
      JSON.stringify([{ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" }])
    );
    const result = await getProviders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });
});

describe("saveProviders", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("saveProviders writes the given list", async () => {
    await saveProviders([{ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" }]);
    const result = await getProviders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });
});
