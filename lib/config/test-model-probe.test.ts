import { describe, it, expect, vi, afterEach } from "vitest";
import { probeModel } from "./test-model-probe";
import * as providerModule from "../llm/provider";
import type { Provider } from "./types";

const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://x.test", apiKey: "k", kind: "openai-compatible" };

describe("probeModel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns pass when the model returns valid structured output", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({ content: '{"ok":true}', inputTokens: 5, outputTokens: 5 });
    expect(await probeModel(provider, "m")).toBe("pass");
  });

  it("returns fail when the model returns non-JSON output", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({ content: "not json", inputTokens: 5, outputTokens: 5 });
    expect(await probeModel(provider, "m")).toBe("fail");
  });

  it("returns unreachable when the call throws", async () => {
    vi.spyOn(providerModule, "callLLM").mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await probeModel(provider, "m")).toBe("unreachable");
  });

  it("returns timeout when the call takes too long", async () => {
    vi.spyOn(providerModule, "callLLM").mockImplementation(() => new Promise(() => {}));
    expect(await probeModel(provider, "m", 50)).toBe("timeout");
  });
});
