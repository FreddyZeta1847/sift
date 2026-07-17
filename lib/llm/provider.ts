import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../config/types";

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
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
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

  if (!res.ok) {
    throw new Error(`LLM call failed: ${provider.baseUrl} returned ${res.status}`);
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
  const client = new Anthropic({ apiKey: provider.apiKey });
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
