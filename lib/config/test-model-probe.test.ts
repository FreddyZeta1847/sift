/**
 * Tests for lib/config/test-model-probe.ts.
 *
 * The load-bearing distinction here is between the two ways a probe can end
 * without an answer, which this module used to conflate:
 *
 *   - "timeout"      the PROVIDER was given its full allowance and did not
 *                    respond. A real failure.
 *   - "inconclusive" WE stopped waiting, because the probe's own (user
 *                    configurable) budget elapsed first. The call may well
 *                    have been fine — we simply do not know.
 *
 * Every test below that touches timing exists to keep those two apart.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { probeModel, probeModelWithUsage } from "./test-model-probe";
import * as providerModule from "../llm/provider";
import type { Provider } from "./types";

const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://x.test", apiKey: "k", kind: "openai-compatible" };

// Shaped exactly like what callOpenAICompatibleOnce throws when its
// AbortController fires at LLM_TIMEOUT_MS (see lib/llm/provider.ts).
function providerTimeoutError(): Error {
  const err = new Error("LLM call failed: https://x.test timed out after 180000ms");
  err.name = "TransientLlmError";
  (err as Error & { llmTimeout?: true }).llmTimeout = true;
  return err;
}

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

  it("returns fail (not unreachable) when the model responds but with no usable content — e.g. a reasoning model that spent its whole budget on hidden reasoning", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({
      content: undefined as unknown as string,
      inputTokens: 5,
      outputTokens: 0,
    });
    expect(await probeModel(provider, "m")).toBe("fail");
  });

  it("returns unreachable when the call throws", async () => {
    vi.spyOn(providerModule, "callLLM").mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await probeModel(provider, "m")).toBe("unreachable");
  });

  it("returns timeout when the PROVIDER itself timed out — not unreachable", async () => {
    vi.spyOn(providerModule, "callLLM").mockRejectedValue(providerTimeoutError());
    expect(await probeModel(provider, "m")).toBe("timeout");
  });

  it("returns timeout when the Anthropic SDK reports a connection timeout", async () => {
    const err = new Error("Request timed out.");
    err.name = "APIConnectionTimeoutError";
    vi.spyOn(providerModule, "callLLM").mockRejectedValue(err);
    expect(await probeModel(provider, "m")).toBe("timeout");
  });

  it("still returns unreachable for a transient non-timeout error, so the new timeout branch cannot swallow real failures", async () => {
    const err = new Error("LLM call failed: https://x.test returned 503: overloaded");
    err.name = "TransientLlmError";
    vi.spyOn(providerModule, "callLLM").mockRejectedValue(err);
    expect(await probeModel(provider, "m")).toBe("unreachable");
  });

  it("returns inconclusive — NOT timeout — when our own budget elapses first", async () => {
    vi.spyOn(providerModule, "callLLM").mockImplementation(() => new Promise(() => {}));
    expect(await probeModel(provider, "m", 50)).toBe("inconclusive");
  });
});

describe("probeModelWithUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces the token counts so the caller can record what the probe cost", async () => {
    vi.spyOn(providerModule, "callLLM").mockResolvedValue({ content: '{"ok":true}', inputTokens: 11, outputTokens: 7 });
    expect(await probeModelWithUsage(provider, "m")).toEqual({ result: "pass", inputTokens: 11, outputTokens: 7 });
  });

  it("reports zero usage when the call never produced a response", async () => {
    vi.spyOn(providerModule, "callLLM").mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await probeModelWithUsage(provider, "m")).toEqual({ result: "unreachable", inputTokens: 0, outputTokens: 0 });
  });

  it("reports zero usage when our own budget elapses first", async () => {
    vi.spyOn(providerModule, "callLLM").mockImplementation(() => new Promise(() => {}));
    expect(await probeModelWithUsage(provider, "m", 50)).toEqual({
      result: "inconclusive",
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
