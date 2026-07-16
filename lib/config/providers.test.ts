import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { getProviders } from "./providers";

describe("getProviders", () => {
  afterEach(() => {
    if (existsSync("config")) rmSync("config", { recursive: true, force: true });
  });

  it("returns an empty array by default", async () => {
    const result = await getProviders();
    expect(result).toEqual([]);
  });

  it("returns configured providers", async () => {
    mkdirSync("config", { recursive: true });
    writeFileSync(
      "config/providers.json",
      JSON.stringify([{ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" }])
    );
    const result = await getProviders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });
});
