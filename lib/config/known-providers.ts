/**
 * Curated "quick add" presets for the API Config page — well-known
 * providers pre-filled with their baseUrl/kind, so a user only has to
 * pick one, name it, and paste an API key rather than looking up the
 * correct endpoint/kind combination by hand.
 *
 * `baseUrl` accuracy: verified live against a real key during
 * development for `nvidia-nim` and `google-gemini` (both confirmed
 * working via direct API calls — see ~/.claude/issues/ for the session
 * that surfaced this). `openai`, `openrouter`, and `deepseek` are their
 * providers' own documented, stable base endpoints, not independently
 * verified against a live key here — the exact endpoint path rarely
 * changes even when model names do, but confirm with "Test this model"
 * after adding a real key, same as any provider.
 *
 * `requiresApiKey` exists for Ollama, and for anything else self-hosted
 * that may follow it: a local server has no key to paste, so the blank
 * `apiKey` field that means "not set up yet" for every hosted provider
 * means "correctly configured" here. Without this flag the API Config page
 * would show a permanent red warning on a provider that is working fine.
 */
import type { Provider } from "./types";

export type KnownProviderPreset = Pick<Provider, "label" | "baseUrl" | "kind"> & {
  suggestedId: string;
  /** Defaults to true — only a local/self-hosted provider sets this false. */
  requiresApiKey?: boolean;
};

export const KNOWN_PROVIDERS: KnownProviderPreset[] = [
  {
    suggestedId: "anthropic",
    label: "Anthropic",
    // The real Anthropic endpoint, shown for reference only — the add-
    // provider form requires a non-empty Base URL, but this value is
    // actually ignored for kind: "anthropic" (the SDK always targets its
    // own endpoint regardless of what's stored here).
    baseUrl: "https://api.anthropic.com",
    kind: "anthropic",
  },
  {
    suggestedId: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    kind: "openai-compatible",
  },
  {
    suggestedId: "google-gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    kind: "openai-compatible",
  },
  {
    suggestedId: "nvidia-nim",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    kind: "openai-compatible",
  },
  {
    suggestedId: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    kind: "openai-compatible",
  },
  {
    suggestedId: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    kind: "openai-compatible",
  },
  {
    suggestedId: "lmstudio",
    label: "LM Studio (local)",
    // LM Studio's built-in server speaks OpenAI's shape on port 1234 by
    // default. Same Docker caveat as Ollama below: from inside a container,
    // reach the host with host.docker.internal instead of localhost.
    baseUrl: "http://localhost:1234/v1",
    kind: "openai-compatible",
    requiresApiKey: false,
  },
  {
    suggestedId: "ollama",
    label: "Ollama (local)",
    // Ollama serves an OpenAI-compatible surface at /v1 alongside its own
    // native API, so it needs no special provider kind. The default port is
    // 11434; a user running it elsewhere just edits the Base URL.
    //
    // Note for Docker self-hosters: "localhost" inside the sift container is
    // the container, not the host. Reaching an Ollama running on the host
    // machine means http://host.docker.internal:11434/v1 instead.
    baseUrl: "http://localhost:11434/v1",
    kind: "openai-compatible",
    // Ollama ignores the Authorization header entirely. Sending an empty
    // Bearer token is harmless, and an empty key here is correct, not a
    // half-finished setup.
    requiresApiKey: false,
  },
];

// Matched by id OR baseUrl for the same reason isKnownProvider is in the
// API Config form: a provider added by hand can carry a known endpoint under
// a custom id, and the endpoint is the more stable signal of the two.
export function providerNeedsApiKey(provider: Pick<Provider, "id" | "baseUrl">): boolean {
  const preset = KNOWN_PROVIDERS.find((p) => p.suggestedId === provider.id || p.baseUrl === provider.baseUrl);
  return preset?.requiresApiKey ?? true;
}
