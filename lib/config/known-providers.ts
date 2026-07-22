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
 */
import type { Provider } from "./types";

export type KnownProviderPreset = Pick<Provider, "label" | "baseUrl" | "kind"> & { suggestedId: string };

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
];
