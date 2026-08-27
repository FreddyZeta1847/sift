export interface Provider {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  kind: "openai-compatible" | "anthropic";
}

export interface Source {
  name: string;
  url: string;
  category: string;
  enabled: boolean;
}

export interface VoiceProfile {
  toneNotes: string;
  examplePosts: string[];
  interests: string[];
}

export interface Settings {
  budgetCapUsd: number | null;
  postsRetentionDays: number | null;
  candidateRetentionDays: number | null;
  scheduleDays: string[];
  scheduleTime: string;
  voiceProfile: VoiceProfile;
  curationProviderId: string | null;
  curationModel: string | null;
  draftingProviderId: string | null;
  draftingModel: string | null;
  curationTopN: number;
  // --- Model checking ---------------------------------------------------
  // How long anything is willing to wait for a model, and whether the
  // automatic startup check runs at all. These are user-facing sliders
  // (Settings page) rather than constants because the right value depends
  // entirely on which models someone actually runs: a small local model
  // answers in a second, a hosted reasoning model can spend most of a
  // minute on hidden reasoning before emitting a token.
  //
  // The two probe budgets are OUR patience, not the provider's. When one
  // elapses the verdict is "inconclusive", never a failure — see the header
  // of lib/config/test-model-probe.ts. llmCallTimeoutMs is different: it is
  // the allowance the provider itself is given inside a real pipeline call,
  // and exceeding it is a genuine timeout.
  modelHealthCheckEnabled: boolean;
  healthCheckTimeoutMs: number;
  probeTimeoutMs: number;
  llmCallTimeoutMs: number;
}

/**
 * One row of the model registry (config/models.json): a model this install
 * uses, and what it costs per 1,000,000 tokens in each direction.
 *
 * Declared here rather than beside its file I/O in lib/config/models.ts on
 * purpose. This module imports nothing, so a Client Component can use the
 * type and the helper below without webpack following the import into
 * read-config.ts and its node:fs/node:path dependencies — which is a build
 * failure, not a warning.
 */
export interface ModelEntry {
  providerId: string;
  model: string;
  inputPer1M: number;
  outputPer1M: number;
}

/** The dropdown contents for one provider, in the order they were added. */
export function modelsForProvider(models: ModelEntry[], providerId: string): ModelEntry[] {
  return models.filter((m) => m.providerId === providerId);
}
