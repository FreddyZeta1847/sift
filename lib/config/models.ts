/**
 * Read/write access to config/models.json — the registry of models this
 * install actually uses, and what each one costs.
 *
 * It does two jobs on purpose, because they are the same list:
 *
 *  1. It is the menu. The API Config page's model fields are dropdowns fed
 *     from here, filtered by the selected provider, instead of free text you
 *     have to spell correctly from memory.
 *  2. It is the rate card. lib/llm/pricing.ts resolves a call's cost from
 *     these rows.
 *
 * WHY THIS REPLACED A HARD-CODED LIST
 * Prices used to live in a four-entry record inside lib/llm/pricing.ts, and
 * anything absent from it cost $0. That was fine for its stated purpose
 * (local models really are free) but it silently swallowed real spend: a
 * self-hoster running Gemini saw $0.00 on the Costs page and a monthly
 * budget cap that could never fire, because no Gemini model was in the list
 * and nothing said so. No hard-coded list can keep up with an app where the
 * user brings their own providers — so the list became theirs.
 *
 * KEYED BY PROVIDER **AND** MODEL, because the same model name costs
 * different amounts through different providers — and nothing through a
 * local one.
 *
 * Prices are per 1,000,000 tokens, matching how every provider publishes
 * them, so a value can be copied off a pricing page without arithmetic.
 */
import { readConfig, writeConfig, configPath } from "./read-config";
import type { ModelEntry } from "./types";

// The shape and the pure helper live in ./types (which imports nothing), so
// Client Components can use them without dragging this file's node:fs
// dependency into the browser bundle. Re-exported here so server-side callers
// can keep importing everything model-related from one place.
export type { ModelEntry } from "./types";
export { modelsForProvider } from "./types";

// Only used when config/models.json doesn't exist yet (a fresh install),
// never merged into an existing file — the same seeding rule as
// lib/config/providers.ts and lib/config/sources.ts. These four carry over
// the exact prices the old hard-coded record used, so nobody's numbers move
// as a side effect of this file existing. Deliberately nothing for Gemini,
// Ollama or the rest: inventing a price would be worse than admitting there
// isn't one, and an unpriced model is now visibly flagged rather than
// silently counted as free.
const SEED_MODELS: ModelEntry[] = [
  { providerId: "openai", model: "gpt-4o-mini", inputPer1M: 0.15, outputPer1M: 0.6 },
  { providerId: "openai", model: "gpt-4o", inputPer1M: 2.5, outputPer1M: 10.0 },
  { providerId: "anthropic", model: "claude-3-5-haiku-20241022", inputPer1M: 0.8, outputPer1M: 4.0 },
  { providerId: "anthropic", model: "claude-3-5-sonnet-20241022", inputPer1M: 3.0, outputPer1M: 15.0 },
];

export async function getModels(): Promise<ModelEntry[]> {
  return readConfig<ModelEntry[]>(configPath("models.json"), SEED_MODELS);
}

export async function saveModels(models: ModelEntry[]): Promise<void> {
  return writeConfig(configPath("models.json"), models);
}
