/**
 * Server Actions for the API Config page (`/config/api`).
 *
 * Provider CRUD (`addProvider`/`updateProvider`/`deleteProvider`) reads and
 * rewrites the whole `config/providers.json` array via the Task 7
 * `getProviders`/`saveProviders` layer — there's no per-row storage, so
 * every mutation is a full read-modify-write of the array.
 *
 * `deleteProvider` refuses to remove a provider that's currently assigned to
 * either pipeline stage in `config/settings.json` (curation or drafting) —
 * deleting it out from under an assigned stage would leave that stage
 * pointing at a provider id that no longer resolves. The caller must
 * reassign the stage to a different provider first.
 *
 * `assignModels` writes all four stage-assignment fields
 * (curationProviderId/curationModel/draftingProviderId/draftingModel)
 * together as one `saveSettings` call, preserving the rest of the settings
 * object.
 *
 * Every action's actual `saveProviders`/`saveSettings` write is routed
 * through `lib/config/safe-write.ts`'s `safeWrite` so a genuine I/O failure
 * surfaces as `{ok: false, error}` instead of throwing and rejecting the
 * Server Action unhandled.
 *
 * `probeModelAction` is a thin "use server" wrapper around
 * `probeModel` (lib/config/test-model-probe.ts): the probe itself does a
 * live network call and can't be imported directly into a Client Component,
 * so this looks the provider up by id from `getProviders()` and delegates.
 * If the id doesn't resolve to a known provider, it reports "unreachable"
 * rather than throwing, since from the UI's perspective an unresolvable
 * provider is indistinguishable from an unreachable one.
 *
 * The model-registry actions (`addModel`/`updateModelPrices`/`deleteModel`)
 * follow the same read-modify-write shape over `config/models.json`. Two
 * guards are worth naming:
 *
 *  - `addModel` rejects a duplicate (providerId, model) pair, since the pair
 *    is the registry's key — a second row would shadow the first with no way
 *    to tell which price was in force.
 *  - `deleteModel` refuses to remove a pair a pipeline stage is currently
 *    assigned to, mirroring `deleteProvider`'s guard: the assignment would
 *    survive as a name the model dropdown can no longer offer.
 *
 * `updateModelPrices` changes only the two prices, never the pair itself —
 * renaming a model is adding a different one, and keeping the key immutable
 * means an edit can never silently retarget an assigned stage.
 *
 * Note: this project's `"use server"` files must export only
 * locally-declared async functions (bare re-exports fail Next.js's
 * compiler — this was discovered during a prior task), so this file is
 * written directly, not via re-export.
 */
"use server";

import { getProviders, saveProviders } from "../../../lib/config/providers";
import { getModels, saveModels, type ModelEntry } from "../../../lib/config/models";
import { getSettings, saveSettings } from "../../../lib/config/settings";
import { probeModelWithUsage, type ProbeResult } from "../../../lib/config/test-model-probe";
import { tryLogNonPipelineCall } from "../../../lib/llm/non-pipeline-calls";
import { listProviderModels } from "../../../lib/llm/list-models";
import { invalidateModelHealth, startModelHealthCheck } from "../../../lib/health/model-health";
import { safeWrite } from "../../../lib/config/safe-write";
import type { Provider } from "../../../lib/config/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function addProvider(provider: Provider): Promise<ActionResult> {
  const providers = await getProviders();
  if (providers.some((p) => p.id === provider.id)) {
    return { ok: false, error: `Provider id "${provider.id}" already exists` };
  }
  return safeWrite(() => saveProviders([...providers, provider]));
}

export async function updateProvider(provider: Provider): Promise<ActionResult> {
  const providers = await getProviders();
  const next = providers.map((p) => (p.id === provider.id ? provider : p));
  return safeWrite(() => saveProviders(next));
}

export async function deleteProvider(id: string): Promise<ActionResult> {
  const settings = await getSettings();
  if (settings.curationProviderId === id || settings.draftingProviderId === id) {
    return { ok: false, error: `Provider "${id}" is assigned to a pipeline stage — reassign it first` };
  }
  const providers = await getProviders();
  return safeWrite(() => saveProviders(providers.filter((p) => p.id !== id)));
}

export async function assignModels(assignment: {
  curationProviderId: string;
  curationModel: string;
  draftingProviderId: string;
  draftingModel: string;
}): Promise<ActionResult> {
  const settings = await getSettings();
  const written = await safeWrite(() => saveSettings({ ...settings, ...assignment }));

  // Whatever the startup check concluded is now about models that are no
  // longer assigned, so it is thrown away and re-run against the new pair.
  // Only on a successful write: if the save failed, the old assignment (and
  // therefore the old verdict) is still the truth.
  //
  // Deliberately re-checked WITHOUT re-showing the startup screen or
  // re-locking the buttons. The screen exists to explain a cold start;
  // throwing it up again immediately after a deliberate save would interrupt
  // the user at the exact moment they are working.
  if (written.ok) {
    invalidateModelHealth();
    startModelHealthCheck();
  }
  return written;
}

export async function probeModelAction(providerId: string, model: string): Promise<ProbeResult> {
  const providers = await getProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return "unreachable";
  }
  // The budget is the user's, not this file's: how long a model is worth
  // waiting for depends entirely on which model it is. A "timeout" here means
  // the provider gave up; running past this budget means WE gave up, and is
  // reported as "inconclusive" instead — see lib/config/test-model-probe.ts.
  const settings = await getSettings();
  const outcome = await probeModelWithUsage(provider, model, settings.probeTimeoutMs);

  // A probe is a real, billable call. It went unrecorded until now, which is
  // how spend became invisible in the first place.
  if (outcome.inputTokens > 0 || outcome.outputTokens > 0) {
    await tryLogNonPipelineCall({
      origin: "probe",
      provider: provider.id,
      model,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
    });
  }
  return outcome.result;
}

// ---------------------------------------------------------------------------
// Model registry (config/models.json) — the list of models this install uses,
// and what each costs. Doubles as the source for the model dropdowns.

function samePair(a: { providerId: string; model: string }, b: { providerId: string; model: string }): boolean {
  return a.providerId === b.providerId && a.model === b.model;
}

export async function addModel(entry: ModelEntry): Promise<ActionResult> {
  const models = await getModels();
  if (models.some((m) => samePair(m, entry))) {
    return { ok: false, error: `${entry.model} is already listed for this provider` };
  }
  return safeWrite(() => saveModels([...models, entry]));
}

export async function updateModelPrices(
  providerId: string,
  model: string,
  inputPer1M: number,
  outputPer1M: number
): Promise<ActionResult> {
  const models = await getModels();
  if (!models.some((m) => samePair(m, { providerId, model }))) {
    return { ok: false, error: `${model} is not listed for this provider` };
  }
  const next = models.map((m) => (samePair(m, { providerId, model }) ? { ...m, inputPer1M, outputPer1M } : m));
  return safeWrite(() => saveModels(next));
}

export async function deleteModel(providerId: string, model: string): Promise<ActionResult> {
  const settings = await getSettings();
  const assignedToCuration = settings.curationProviderId === providerId && settings.curationModel === model;
  const assignedToDrafting = settings.draftingProviderId === providerId && settings.draftingModel === model;
  if (assignedToCuration || assignedToDrafting) {
    return { ok: false, error: `${model} is assigned to a pipeline stage — reassign that stage first` };
  }
  const models = await getModels();
  return safeWrite(() => saveModels(models.filter((m) => !samePair(m, { providerId, model }))));
}

/**
 * Asks a provider for its model list, so the Add-model card can suggest real
 * names. Server-side because a browser cannot reach a local provider (CORS),
 * and in Docker "localhost" means the container, not the user's machine.
 *
 * Returns the failure rather than throwing: not being able to list models is
 * a missing convenience, not a broken page — the model field stays typeable.
 */
export async function fetchProviderModels(
  providerId: string
): Promise<{ models: string[]; error?: string }> {
  const providers = await getProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return { models: [], error: `Provider "${providerId}" not found` };
  }
  return listProviderModels(provider);
}
