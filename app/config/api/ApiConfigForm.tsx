/**
 * Interactive form for the API Config page (`/config/api`).
 *
 * Client Component following the same interaction pattern established by
 * `app/review/DraftCard.tsx`: local `useState` for form fields and status
 * text, `useRouter().refresh()` after a successful mutation so the Server
 * Component re-fetches fresh `providers`/`settings` props, and a
 * `<p role="alert">{status}</p>` per section for both success and failure
 * messages. Per-stage "Test this model" probes use `useTransition` (mirroring
 * DraftCard's Regenerate button) so each button can show a pending label
 * independently while its `probeModelAction` Server Action call is in flight.
 *
 * The provider list and the two model-assignment dropdowns are rendered
 * directly from the `providers`/`settings` props rather than copied into
 * local state, so a `router.refresh()` after add/delete immediately reflects
 * the new provider set everywhere it's used on this page. Only the
 * add-provider mini-form and the assignment/probe fields are held in local
 * state, since those are user-in-progress input rather than a mirror of
 * server data.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProvider, deleteProvider, assignModels, probeModelAction } from "./actions";
import type { Provider, Settings } from "../../../lib/config/types";
import type { ProbeResult } from "../../../lib/config/test-model-probe";

const EMPTY_NEW_PROVIDER = {
  id: "",
  label: "",
  baseUrl: "",
  apiKey: "",
  kind: "openai-compatible" as Provider["kind"],
};

export function ApiConfigForm({ providers, settings }: { providers: Provider[]; settings: Settings }) {
  const router = useRouter();

  const [newProvider, setNewProvider] = useState(EMPTY_NEW_PROVIDER);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const [curationProviderId, setCurationProviderId] = useState(settings.curationProviderId ?? "");
  const [curationModel, setCurationModel] = useState(settings.curationModel ?? "");
  const [draftingProviderId, setDraftingProviderId] = useState(settings.draftingProviderId ?? "");
  const [draftingModel, setDraftingModel] = useState(settings.draftingModel ?? "");
  const [assignStatus, setAssignStatus] = useState<string | null>(null);

  const [curationProbeResult, setCurationProbeResult] = useState<ProbeResult | null>(null);
  const [draftingProbeResult, setDraftingProbeResult] = useState<ProbeResult | null>(null);
  const [isCurationProbing, startCurationProbe] = useTransition();
  const [isDraftingProbing, startDraftingProbe] = useTransition();

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await addProvider(newProvider);
    if (!result.ok) {
      setAddStatus(`Add failed: ${result.error}`);
      return;
    }
    setAddStatus("Provider added.");
    setNewProvider(EMPTY_NEW_PROVIDER);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    const result = await deleteProvider(id);
    if (!result.ok) {
      setDeleteErrors((prev) => ({ ...prev, [id]: result.error ?? "Delete failed" }));
      return;
    }
    setDeleteErrors((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    router.refresh();
  };

  const handleSaveAssignment = async () => {
    const result = await assignModels({ curationProviderId, curationModel, draftingProviderId, draftingModel });
    if (!result.ok) {
      setAssignStatus(`Save failed: ${result.error}`);
      return;
    }
    setAssignStatus("Model assignment saved.");
    router.refresh();
  };

  const handleTestCuration = () => {
    startCurationProbe(async () => {
      setCurationProbeResult(await probeModelAction(curationProviderId, curationModel));
    });
  };

  const handleTestDrafting = () => {
    startDraftingProbe(async () => {
      setDraftingProbeResult(await probeModelAction(draftingProviderId, draftingModel));
    });
  };

  return (
    <div>
      <section>
        <h2>Providers</h2>
        <ul>
          {providers.map((p) => (
            <li key={p.id}>
              {p.label} — {p.baseUrl} ({p.kind})
              <button onClick={() => handleDelete(p.id)}>Delete</button>
              {deleteErrors[p.id] && <p role="alert">{deleteErrors[p.id]}</p>}
            </li>
          ))}
        </ul>

        <form onSubmit={handleAddProvider}>
          <input
            placeholder="id"
            value={newProvider.id}
            onChange={(e) => setNewProvider({ ...newProvider, id: e.target.value })}
          />
          <input
            placeholder="label"
            value={newProvider.label}
            onChange={(e) => setNewProvider({ ...newProvider, label: e.target.value })}
          />
          <input
            placeholder="baseUrl"
            value={newProvider.baseUrl}
            onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
          />
          <input
            placeholder="apiKey"
            type="password"
            value={newProvider.apiKey}
            onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
          />
          <select
            value={newProvider.kind}
            onChange={(e) => setNewProvider({ ...newProvider, kind: e.target.value as Provider["kind"] })}
          >
            <option value="openai-compatible">openai-compatible</option>
            <option value="anthropic">anthropic</option>
          </select>
          <button type="submit">Add provider</button>
        </form>
        {addStatus && <p role="alert">{addStatus}</p>}
      </section>

      <section>
        <h2>Model assignment</h2>

        <div>
          <h3>Curation model</h3>
          <select value={curationProviderId} onChange={(e) => setCurationProviderId(e.target.value)}>
            <option value="">— select provider —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            placeholder="model name"
            value={curationModel}
            onChange={(e) => setCurationModel(e.target.value)}
          />
          <button onClick={handleTestCuration} disabled={isCurationProbing || !curationProviderId || !curationModel}>
            {isCurationProbing ? "Testing…" : "Test this model"}
          </button>
          {curationProbeResult && <span>{curationProbeResult}</span>}
        </div>

        <div>
          <h3>Drafting model</h3>
          <select value={draftingProviderId} onChange={(e) => setDraftingProviderId(e.target.value)}>
            <option value="">— select provider —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            placeholder="model name"
            value={draftingModel}
            onChange={(e) => setDraftingModel(e.target.value)}
          />
          <button onClick={handleTestDrafting} disabled={isDraftingProbing || !draftingProviderId || !draftingModel}>
            {isDraftingProbing ? "Testing…" : "Test this model"}
          </button>
          {draftingProbeResult && <span>{draftingProbeResult}</span>}
        </div>

        <button onClick={handleSaveAssignment}>Save model assignment</button>
        {assignStatus && <p role="alert">{assignStatus}</p>}
      </section>
    </div>
  );
}
