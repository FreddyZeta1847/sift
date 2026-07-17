import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { getProviders } from "./providers";

const testConfigDir = "data/test-config-providers";

describe("getProviders", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("returns an empty array by default", async () => {
    const result = await getProviders();
    expect(result).toEqual([]);
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
