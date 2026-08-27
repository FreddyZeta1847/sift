/**
 * Asks a provider which models it offers, so the API Config page can suggest
 * real names instead of making you spell one from memory.
 *
 * Every provider sift ships with can answer this — the local ones (Ollama,
 * LM Studio) and the hosted ones alike — so this is deliberately not a
 * local-only feature:
 *
 *   openai-compatible  GET {baseUrl}/models  ->  { data: [{ id }, ...] }
 *                      Ollama, LM Studio, OpenAI, OpenRouter, DeepSeek,
 *                      NVIDIA NIM and Gemini's OpenAI-compat surface all
 *                      implement this identically.
 *   anthropic          the SDK's own models.list(), which is a different
 *                      endpoint with different auth headers — hence the two
 *                      paths, mirroring how callLLM is split in provider.ts.
 *
 * WHY THIS MATTERS BEYOND CONVENIENCE
 * A mistyped model name is indistinguishable from a broken one: the provider
 * returns 404, the probe reports "unreachable", and that reads as "your API
 * key is wrong". Picking from a list the provider itself supplied removes
 * that whole class of confusion.
 *
 * Never throws for the caller's benefit — a provider that cannot list its
 * models is a mild inconvenience, not a failure, and the model field stays
 * typeable either way.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../config/types";

// Short on purpose. This runs while someone waits with a dialog open, and a
// listing endpoint that is slow is a listing endpoint worth giving up on —
// unlike a real inference call, nothing is lost by not waiting.
const LIST_TIMEOUT_MS = 15_000;

// OpenRouter alone returns several hundred. Enough to be complete in
// practice, bounded so a misbehaving endpoint cannot stream forever.
const MAX_MODELS = 1000;

export interface ModelListing {
  models: string[];
  /** Present when the provider could not be asked. Never thrown. */
  error?: string;
}

export async function listProviderModels(provider: Provider): Promise<ModelListing> {
  try {
    const models = provider.kind === "anthropic" ? await listAnthropic(provider) : await listOpenAICompatible(provider);
    // Sorted for a stable, scannable dropdown: providers return these in
    // creation order, which is neither.
    return { models: [...new Set(models)].sort((a, b) => a.localeCompare(b)) };
  } catch (err) {
    return { models: [], error: describe(err) };
  }
}

async function listAnthropic(provider: Provider): Promise<string[]> {
  const client = new Anthropic({ apiKey: provider.apiKey, timeout: LIST_TIMEOUT_MS });
  const models: string[] = [];
  // The list is paginated and the SDK iterates pages for us.
  for await (const model of client.models.list()) {
    models.push(model.id);
    if (models.length >= MAX_MODELS) break;
  }
  return models;
}

async function listOpenAICompatible(provider: Provider): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/models`, {
      signal: controller.signal,
      headers: {
        // Local servers ignore this; hosted ones require it. Sending an empty
        // bearer to Ollama is harmless.
        Authorization: `Bearer ${provider.apiKey}`,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${provider.baseUrl} did not respond within ${LIST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`${provider.baseUrl} returned ${res.status}`);
  }

  const body: unknown = await res.json();
  const ids = extractIds(body);
  if (ids.length === 0) {
    throw new Error(`${provider.baseUrl} returned no models`);
  }
  return ids.slice(0, MAX_MODELS);
}

// Defensive rather than trusting: this parses a response from whatever server
// the user pointed at, which may not be the API they think it is.
function extractIds(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => (typeof entry === "object" && entry !== null ? (entry as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // A local provider that isn't running is the single most likely failure
  // here, and "fetch failed" tells the user nothing about that.
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return "Could not reach this provider. If it's a local one, check that it's running.";
  }
  return message;
}
