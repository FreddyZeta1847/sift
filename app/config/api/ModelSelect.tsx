/**
 * The model field on the API Config page: a dropdown of the models you have
 * registered for the selected provider, rather than free text.
 *
 * Why a dropdown at all: a mistyped model name used to be indistinguishable
 * from a broken one — the provider returns a 404 and the probe reports
 * "unreachable", which reads as "your key is wrong". Choosing from a list
 * removes that whole class of confusion, and it means the model you assign
 * is always one the registry can price.
 *
 * TWO CASES THIS COMPONENT EXISTS TO HANDLE GRACEFULLY
 *
 * 1. A stage is already assigned a model that is NOT in the registry. That
 *    is the normal state of every install that predates the registry, and it
 *    would be indefensible to silently blank someone's working configuration
 *    on first load. The current value is always offered, flagged as unlisted,
 *    and stays selected until the user changes it themselves.
 *
 * 2. The provider has no models registered yet. Rather than an empty
 *    dropdown that looks broken, say what to do about it and point at the
 *    table on the same page.
 */
"use client";

import { modelsForProvider, type ModelEntry } from "../../../lib/config/types";

interface ModelSelectProps {
  providerId: string;
  models: ModelEntry[];
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelect({ providerId, models, value, onChange }: ModelSelectProps) {
  if (!providerId) {
    return (
      <label>
        Model
        <select value="" disabled>
          <option value="">— select a provider first —</option>
        </select>
      </label>
    );
  }

  const available = modelsForProvider(models, providerId);
  // Case 1: never drop a working assignment just because it predates the
  // registry. Offer it, mark it, and leave the choice to the user.
  const unlisted = value !== "" && !available.some((m) => m.model === value);

  return (
    <label>
      Model
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select model —</option>
        {available.map((m) => (
          <option key={m.model} value={m.model}>
            {m.model}
          </option>
        ))}
        {unlisted && <option value={value}>{value} (not in your model list)</option>}
      </select>
      {available.length === 0 && (
        <span className="status-line">No models listed for this provider yet — add one in Models &amp; pricing below.</span>
      )}
      {unlisted && (
        <span className="status-line">
          This model isn&apos;t in your list, so its cost can&apos;t be worked out. Add it below to track spend.
        </span>
      )}
    </label>
  );
}
