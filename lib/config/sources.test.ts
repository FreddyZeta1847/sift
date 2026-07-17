import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSources } from "./sources";
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
