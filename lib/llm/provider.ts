/**
 * A single unified `callLLM` entry point for both provider kinds sift
 * supports (Anthropic's own SDK, and any OpenAI-compatible endpoint) —
 * Curation Engine and Draft Generator both call through here rather than
 * touching either provider's client directly.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../config/types";

// Without a timeout, a slow/unresponsive provider hangs `fetch` forever —
// the request never resolves or rejects, so the caller (Curation/Draft
// Generator) never reaches its own catch block, the pipeline_runs row is
// never marked success/aborted, and the in-memory run-guard (see
// lib/pipeline/run-guard.ts) never clears, permanently blocking every
// future Run Now/Regenerate. Matches DRAFT-GENERATOR--resilience.md's
// already-documented "API error/timeout" hard-failure path, which assumed
// this existed. Originally 90s, on the assumption that curation/drafting
// calls are typically single-digit seconds to low tens of seconds — measured
// against a real hosted 70B model, a normal-shaped drafting call (a realistic
// prompt, a few hundred output tokens, nowhere near the 8000-token cap) took
// 116s, comfortably over that assumption. 180s gives real headroom for a
// heavier hosted model without meaningfully weakening the hung-request
// safety net this timeout exists for.
const LLM_TIMEOUT_MS = 180_000;

// The Anthropic SDK already retries transient failures internally
// (`maxRetries`, default 2 — see @anthropic-ai/sdk's client.d.ts), covering
// timeouts, 429, and 5xx. The OpenAI-compatible path below is hand-rolled
// fetch(), so it has no such safety net — this is what actually broke: a
// pipeline run aborting outright on a single slow/overloaded call to
// Gemini's OpenAI-compat endpoint (generativelanguage.googleapis.com),
// even though .claude/issues/002 already documented that 429 (quota) and
// 503 (overload) are provider-side signals that just need a retry, not a
// hard failure. Retries only these two conditions plus a timeout — any
// other status (auth, bad request, etc.) is a real config problem and
// still fails immediately, matching DRAFT-GENERATOR--resilience.md's
// "hard failure aborts the run" contract for anything that isn't transient.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [2_000, 8_000];

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function callOpenAICompatibleOnce(
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
      const timeoutErr = new Error(`LLM call failed: ${provider.baseUrl} timed out after ${LLM_TIMEOUT_MS}ms`);
      timeoutErr.name = "TransientLlmError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    const statusErr = new Error(`LLM call failed: ${provider.baseUrl} returned ${res.status}: ${body}`);
    if (isTransientStatus(res.status)) statusErr.name = "TransientLlmError";
    throw statusErr;
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
  };
}

async function callOpenAICompatible(
  provider: Provider,
  model: string,
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await callOpenAICompatibleOnce(provider, model, messages, options);
    } catch (err) {
      const isTransient = err instanceof Error && err.name === "TransientLlmError";
      if (!isTransient || attempt === MAX_ATTEMPTS - 1) throw err;
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
  // Unreachable — the loop above always either returns or throws.
  throw new Error("unreachable");
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
