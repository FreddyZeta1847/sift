/**
 * Tests for lib/llm/provider.ts's callLLM — covers request shaping for both
 * provider kinds (Anthropic SDK, OpenAI-compatible fetch) and the
 * OpenAI-compatible path's retry-on-transient-status behavior (429/503),
 * added after a real pipeline run aborted on a single timed-out Gemini call.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callLLM } from "./provider";
import type { Provider } from "../config/types";
import AnthropicSdk from "@anthropic-ai/sdk";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return { default: vi.fn(() => ({ messages: { create } })), __mockCreate: create };
});

describe("callLLM — openai-compatible", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to {baseUrl}/chat/completions with Bearer auth and parses usage", async () => {
    const provider: Provider = {
      id: "p1",
      label: "Test",
      baseUrl: "https://example.test/v1",
      apiKey: "sk-test",
      kind: "openai-compatible",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 42, completion_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await callLLM(
      provider,
      "gpt-4o-mini",
      [{ role: "user", content: "hi" }],
      { maxOutputTokens: 100 }
    );

    expect(result).toEqual({ content: '{"ok":true}', inputTokens: 42, outputTokens: 7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws on a non-2xx response", async () => {
    const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://example.test/v1", apiKey: "k", kind: "openai-compatible" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("server error", { status: 500 }));

    await expect(
      callLLM(provider, "gpt-4o-mini", [{ role: "user", content: "hi" }], { maxOutputTokens: 100 })
    ).rejects.toThrow(/500/);
  });

  it("includes the response body in the thrown error, so the real reason isn't lost", async () => {
    const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://example.test/v1", apiKey: "k", kind: "openai-compatible" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Function not found for account" }), { status: 404 })
    );

    await expect(
      callLLM(provider, "gpt-4o-mini", [{ role: "user", content: "hi" }], { maxOutputTokens: 100 })
    ).rejects.toThrow(/Function not found for account/);
  });

  it("does not retry a non-transient status (500) — fails on the first attempt", async () => {
    const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://example.test/v1", apiKey: "k", kind: "openai-compatible" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("server error", { status: 500 }));

    await expect(
      callLLM(provider, "gpt-4o-mini", [{ role: "user", content: "hi" }], { maxOutputTokens: 100 })
    ).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient status (429) and succeeds once the provider recovers", async () => {
    const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://example.test/v1", apiKey: "k", kind: "openai-compatible" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("quota exceeded", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const result = await callLLM(provider, "gpt-4o-mini", [{ role: "user", content: "hi" }], { maxOutputTokens: 100 });

    expect(result.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient status (503) up to the attempt cap, then throws", async () => {
    const provider: Provider = { id: "p1", label: "Test", baseUrl: "https://example.test/v1", apiKey: "k", kind: "openai-compatible" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("overloaded", { status: 503 }));
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await expect(
      callLLM(provider, "gpt-4o-mini", [{ role: "user", content: "hi" }], { maxOutputTokens: 100 })
    ).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("callLLM — anthropic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the Anthropic SDK and parses usage, splitting system/user messages", async () => {
    const provider: Provider = { id: "p2", label: "Claude", baseUrl: "", apiKey: "sk-ant-test", kind: "anthropic" };
    const mod = await import("@anthropic-ai/sdk");
    const mockCreate = (mod as unknown as { __mockCreate: ReturnType<typeof vi.fn> }).__mockCreate;
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "hello back" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await callLLM(
      provider,
      "claude-3-5-haiku-20241022",
      [
        { role: "system", content: "be nice" },
        { role: "user", content: "hi" },
      ],
      { maxOutputTokens: 50 }
    );

    expect(result).toEqual({ content: "hello back", inputTokens: 10, outputTokens: 5 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-3-5-haiku-20241022",
        system: "be nice",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 50,
      })
    );
  });
});
