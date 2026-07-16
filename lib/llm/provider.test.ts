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
