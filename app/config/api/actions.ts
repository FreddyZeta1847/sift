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
 * Note: this project's `"use server"` files must export only
 * locally-declared async functions (bare re-exports fail Next.js's
 * compiler — this was discovered during a prior task), so this file is
 * written directly, not via re-export.
 */
"use server";

import { getProviders, saveProviders } from "../../../lib/config/providers";
import { getSettings, saveSettings } from "../../../lib/config/settings";
import { probeModel, type ProbeResult } from "../../../lib/config/test-model-probe";
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
  return safeWrite(() => saveSettings({ ...settings, ...assignment }));
}

export async function probeModelAction(providerId: string, model: string): Promise<ProbeResult> {
  const providers = await getProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    return "unreachable";
  }
  return probeModel(provider, model);
}
