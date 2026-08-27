/**
 * Tests for the known-provider presets.
 *
 * Mostly guards providerNeedsApiKey, which decides whether a blank API key
 * is a problem worth flagging. Getting that wrong in either direction is
 * user-visible: a permanent false warning on a working local provider, or a
 * silent blank key on a hosted one that will only fail at run time.
 */
import { describe, it, expect } from "vitest";
import { KNOWN_PROVIDERS, providerNeedsApiKey } from "./known-providers";

describe("KNOWN_PROVIDERS", () => {
  it("has unique suggested ids", () => {
    const ids = KNOWN_PROVIDERS.map((p) => p.suggestedId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers a local Ollama preset on its OpenAI-compatible surface", () => {
    const ollama = KNOWN_PROVIDERS.find((p) => p.suggestedId === "ollama");
    expect(ollama).toBeDefined();
    // Ollama's /v1 surface speaks OpenAI's shape, so it needs no new kind.
    expect(ollama?.kind).toBe("openai-compatible");
    expect(ollama?.baseUrl).toContain("11434");
  });
});

describe("providerNeedsApiKey", () => {
  it("is false for Ollama, which has no key to give", () => {
    expect(providerNeedsApiKey({ id: "ollama", baseUrl: "http://localhost:11434/v1" })).toBe(false);
  });

  it("recognises Ollama by its endpoint even under a renamed id", () => {
    // A provider added by hand before the preset existed carries a known
    // endpoint under a custom id — the endpoint is the more stable signal.
    expect(providerNeedsApiKey({ id: "my-local-box", baseUrl: "http://localhost:11434/v1" })).toBe(false);
  });

  it("is true for every hosted preset", () => {
    for (const preset of KNOWN_PROVIDERS.filter((p) => p.suggestedId !== "ollama")) {
      expect(providerNeedsApiKey({ id: preset.suggestedId, baseUrl: preset.baseUrl })).toBe(true);
    }
  });

  it("defaults to true for a provider it has never heard of", () => {
    expect(providerNeedsApiKey({ id: "custom", baseUrl: "https://unknown.test/v1" })).toBe(true);
  });
});
