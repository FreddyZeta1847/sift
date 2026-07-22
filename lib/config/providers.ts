/**
 * Read/write access to config/providers.json — the LLM provider list
 * (API Config page). Seeds every known provider (see
 * lib/config/known-providers.ts) on a fresh install so a new self-hoster
 * finds them already listed rather than needing to add each by hand.
 */
import { readConfig, writeConfig, configPath } from "./read-config";
import type { Provider } from "./types";
import { KNOWN_PROVIDERS } from "./known-providers";

// Mirrors lib/config/sources.ts's SEED_SOURCES pattern: only used as the
// default when providers.json doesn't exist yet (a fresh install), never
// merged into an existing file — so a first-time user sees every known
// provider already listed, ready to paste a key into, without a separate
// "add provider" step. Derived from KNOWN_PROVIDERS (the same list the API
// Config page's "quick add" dropdown uses) rather than a second hardcoded
// list, so the two can't drift apart.
const SEED_PROVIDERS: Provider[] = KNOWN_PROVIDERS.map((p) => ({
  id: p.suggestedId,
  label: p.label,
  baseUrl: p.baseUrl,
  apiKey: "",
  kind: p.kind,
}));

export async function getProviders(): Promise<Provider[]> {
  return readConfig<Provider[]>(configPath("providers.json"), SEED_PROVIDERS);
}

export async function saveProviders(providers: Provider[]): Promise<void> {
  return writeConfig(configPath("providers.json"), providers);
}
