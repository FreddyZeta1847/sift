/**
 * Tests for asking a provider which models it offers.
 *
 * The behaviour that matters most is what happens when the answer does NOT
 * arrive: this feature is a convenience, so every failure has to come back as
 * a message rather than an exception, leaving the model field typeable.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { listProviderModels } from "./list-models";
import type { Provider } from "../config/types";

const openaiish: Provider = {
  id: "ollama",
  label: "Ollama (local)",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",
  kind: "openai-compatible",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("listProviderModels — OpenAI-compatible", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks {baseUrl}/models and returns the ids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ object: "list", data: [{ id: "llama3.1:8b" }, { id: "qwen2.5-coder:7b" }] })
    );

    const result = await listProviderModels(openaiish);

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/v1/models");
    expect(result.models).toEqual(["llama3.1:8b", "qwen2.5-coder:7b"]);
    expect(result.error).toBeUndefined();
  });

  it("sorts and de-duplicates, since providers return neither", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: [{ id: "zeta" }, { id: "alpha" }, { id: "zeta" }] })
    );

    expect((await listProviderModels(openaiish)).models).toEqual(["alpha", "zeta"]);
  });

  it("sends the key as a bearer token for hosted providers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ data: [{ id: "gpt-4o" }] }));

    await listProviderModels({ ...openaiish, id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("explains an unreachable local provider in terms of the likely cause", async () => {
    // By far the most common failure: Ollama simply isn't running. "fetch
    // failed" would tell the user nothing about that.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));

    const result = await listProviderModels(openaiish);

    expect(result.models).toEqual([]);
    expect(result.error).toMatch(/running/i);
  });

  it("reports a non-2xx rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, false, 401));

    const result = await listProviderModels(openaiish);

    expect(result.models).toEqual([]);
    expect(result.error).toMatch(/401/);
  });

  it("reports a response that isn't a model list rather than throwing", async () => {
    // Pointing at a server that isn't the API you assumed is an easy mistake
    // to make, and it must not crash the page.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ hello: "world" }));

    const result = await listProviderModels(openaiish);

    expect(result.models).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it("ignores malformed entries inside an otherwise valid list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: [{ id: "good" }, { notAnId: 1 }, null, { id: "" }] })
    );

    expect((await listProviderModels(openaiish)).models).toEqual(["good"]);
  });
});
