import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../config/types";

// Without a timeout, a slow/unresponsive provider hangs `fetch` forever —
// the request never resolves or rejects, so the caller (Curation/Draft
// Generator) never reaches its own catch block, the pipeline_runs row is
// never marked success/aborted, and the in-memory run-guard (see
// lib/pipeline/run-guard.ts) never clears, permanently blocking every
// future Run Now/Regenerate. Matches DRAFT-GENERATOR--resilience.md's
// already-documented "API error/timeout" hard-failure path, which assumed
// this existed. 90s is generous for a real completion (curation/drafting
// calls are typically single-digit seconds to low tens of seconds) while
// still bounding the worst case, mirroring the AbortController pattern
// already used for article fetches in lib/draft/safe-fetch.ts.
const LLM_TIMEOUT_MS = 90_000;

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmCallOptions {
  maxOutputTokens: number;
}

export interface LlmCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

// Minimum model capability floor (documented, not enforced here): sift works
// with any configured model, but models below roughly Llama-3-8B /
// GPT-3.5-turbo class tend to fail at reliable structured-JSON output, which
// both Curation Engine and Draft Generator depend on to parse a response.
// Phase 3's CONFIG-UI "test this model" button is the actual surfaced check
// for this — if it fails, the user should try a stronger model.

async function callOpenAICompatible(
  provider: Provider,
  model: string,
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.maxOutputTokens,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM call failed: ${provider.baseUrl} timed out after ${LLM_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM call failed: ${provider.baseUrl} returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
  };
}

export async function callLLM(
  provider: Provider,
  model: string,
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  if (provider.kind === "anthropic") {
    return callAnthropic(provider, model, messages, options);
  }
  return callOpenAICompatible(provider, model, messages, options);
}

async function callAnthropic(
  provider: Provider,
  model: string,
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const client = new Anthropic({ apiKey: provider.apiKey, timeout: LLM_TIMEOUT_MS });
  const system = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => ({ role: "user" as const, content: m.content }));

  const response = await client.messages.create({
    model,
    system,
    messages: userMessages,
    max_tokens: options.maxOutputTokens,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return {
    content: textBlock && "text" in textBlock ? textBlock.text : "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
