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
 * "Save model assignment" reuses this same provider-selected-but-blank-model
 * guard: it's disabled whenever either stage has a provider chosen with no
 * model name, preventing a silent blank-model save that would only surface
 * as a failure on the next real pipeline run.
 *
 * The provider list and the two model-assignment dropdowns are rendered
 * directly from the `providers`/`settings` props rather than copied into
 * local state, so a `router.refresh()` after add/delete/update immediately
 * reflects the new provider set everywhere it's used on this page. Only the
 * add-provider mini-form and the assignment/probe fields are held in local
 * state, since those are user-in-progress input rather than a mirror of
 * server data.
 *
 * Editing an existing provider reuses this same add-provider field shape:
 * clicking the edit icon on a row sets `editingId` to that provider's id and
 * swaps the row's static text for the identical set of inputs, pre-filled
 * from the provider's current values and held in `editProvider` state. The
 * `id` input is disabled in edit mode: `updateProvider` matches the row to
 * replace by the submitted id, so letting a user retype it risks a silent
 * no-op or overwriting an unrelated provider — ids are only ever chosen in
 * the add-provider form. Since these inputs live in the `<ul>` rather than a
 * `<form>`, their `required` attributes don't enforce anything on their own,
 * so "Save" is additionally disabled whenever `label`/`baseUrl`/`apiKey` is
 * blank (mirroring the "Save model assignment" guard below). "Save" calls
 * `updateProvider` and, on success, shows "Provider updated." via
 * `editStatus`, clears `editingId`, and refreshes; "Cancel" just clears
 * `editingId` without persisting anything.
 *
 * Each provider row leads with a red warning icon when `apiKey` is empty
 * (nothing shown once a key is set — the row just reads clean). Edit is an
 * icon button on every row; Delete is hidden entirely for known providers
 * (their id is in `KNOWN_PROVIDER_IDS`) — there's no reason to force-remove
 * a seeded default a user isn't using, they can just leave its key blank.
 *
 * The add-provider form starts collapsed behind a bare "+" button
 * (`showAddForm`) rather than always taking up page space; submitting or
 * cancelling collapses it back. The Kind field (both add and edit forms)
 * carries an inline info icon whose `title` explains the `anthropic` vs.
 * `openai-compatible` distinction (`KIND_HINT`) — the same guidance given
 * in the README, surfaced right where the decision is made.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProvider, updateProvider, deleteProvider, assignModels, probeModelAction } from "./actions";
import type { Provider, Settings } from "../../../lib/config/types";
import type { ProbeResult } from "../../../lib/config/test-model-probe";
import { KNOWN_PROVIDERS } from "../../../lib/config/known-providers";

const EMPTY_NEW_PROVIDER = {
  id: "",
  label: "",
  baseUrl: "",
  apiKey: "",
  kind: "openai-compatible" as Provider["kind"],
};

const KNOWN_PROVIDER_IDS = new Set(KNOWN_PROVIDERS.map((p) => p.suggestedId));

const KIND_HINT =
  "anthropic = Anthropic's own API (Base URL is ignored — the SDK always targets Anthropic's endpoint, only the key matters). " +
  "openai-compatible = everything else: OpenAI itself, and any provider whose endpoint matches OpenAI's request/response shape " +
  "(Google Gemini, NVIDIA NIM, OpenRouter, DeepSeek, etc.) — use their real Base URL.";

// Visual-only helper: every failure message produced in this file follows
// an "X failed: ..." shape (see the handlers below), so matching that
// substring is enough to apply the danger tint without adding any new
// state — a plain success sentence falls through to the default, quieter
// `.status-line` tone.
function statusTone(message: string): string {
  return /failed/i.test(message) ? "status-line status-line--danger" : "status-line";
}

// Visual-only helper: colors a "test this model" probe result — "pass" is
// the only outcome that means "safe to assign", every other ProbeResult
// value is a problem worth flagging in `--danger`.
function probeTone(result: ProbeResult): string {
  return result === "pass" ? "data status-line--success" : "data status-line--danger";
}

export function ApiConfigForm({ providers, settings }: { providers: Provider[]; settings: Settings }) {
  const router = useRouter();

  const [newProvider, setNewProvider] = useState(EMPTY_NEW_PROVIDER);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProvider, setEditProvider] = useState(EMPTY_NEW_PROVIDER);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState<string | null>(null);

  const [curationProviderId, setCurationProviderId] = useState(settings.curationProviderId ?? "");
  const [curationModel, setCurationModel] = useState(settings.curationModel ?? "");
  const [draftingProviderId, setDraftingProviderId] = useState(settings.draftingProviderId ?? "");
  const [draftingModel, setDraftingModel] = useState(settings.draftingModel ?? "");
  const [assignStatus, setAssignStatus] = useState<string | null>(null);

  const [curationProbeResult, setCurationProbeResult] = useState<ProbeResult | null>(null);
  const [draftingProbeResult, setDraftingProbeResult] = useState<ProbeResult | null>(null);
  const [isCurationProbing, startCurationProbe] = useTransition();
  const [isDraftingProbing, startDraftingProbe] = useTransition();

  const handleQuickAdd = (suggestedId: string) => {
    if (!suggestedId) return;
    const preset = KNOWN_PROVIDERS.find((p) => p.suggestedId === suggestedId);
    if (!preset) return;
    setNewProvider({ id: preset.suggestedId, label: preset.label, baseUrl: preset.baseUrl, apiKey: "", kind: preset.kind });
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await addProvider(newProvider);
    if (!result.ok) {
      setAddStatus(`Add failed: ${result.error}`);
      return;
    }
    setAddStatus("Provider added.");
    setNewProvider(EMPTY_NEW_PROVIDER);
    setShowAddForm(false);
    router.refresh();
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    setNewProvider(EMPTY_NEW_PROVIDER);
    setAddStatus(null);
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

  const handleStartEdit = (p: Provider) => {
    setEditingId(p.id);
    setEditProvider(p);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditProvider(EMPTY_NEW_PROVIDER);
  };

  const handleSaveEdit = async () => {
    const result = await updateProvider(editProvider);
    if (!result.ok) {
      setEditErrors((prev) => ({ ...prev, [editProvider.id]: result.error ?? "Update failed" }));
      return;
    }
    setEditErrors((prev) => {
      const { [editProvider.id]: _removed, ...rest } = prev;
      return rest;
    });
    setEditStatus("Provider updated.");
    setEditingId(null);
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
    <div className="config-page">
      <section id="providers">
        <h2>Providers</h2>
        <div className="provider-table">
          <div className="provider-row provider-row--head">
            <span>Label</span>
            <span>Base URL</span>
            <span>Kind</span>
            <span />
          </div>
          {providers.map((p) =>
            editingId === p.id ? (
              <div key={p.id} className="provider-row provider-row--edit">
                <div className="row-fields">
                  <label>
                    ID
                    <input
                      value={editProvider.id}
                      onChange={(e) => setEditProvider({ ...editProvider, id: e.target.value })}
                      disabled
                      required
                    />
                  </label>
                  <label>
                    Label
                    <input
                      value={editProvider.label}
                      onChange={(e) => setEditProvider({ ...editProvider, label: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Base URL
                    <input
                      value={editProvider.baseUrl}
                      onChange={(e) => setEditProvider({ ...editProvider, baseUrl: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    API key
                    <input
                      type="password"
                      value={editProvider.apiKey}
                      onChange={(e) => setEditProvider({ ...editProvider, apiKey: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Kind
                    <span className="info-icon" title={KIND_HINT} aria-label="How to choose Kind">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                    <select
                      value={editProvider.kind}
                      onChange={(e) => setEditProvider({ ...editProvider, kind: e.target.value as Provider["kind"] })}
                    >
                      <option value="openai-compatible">openai-compatible</option>
                      <option value="anthropic">anthropic</option>
                    </select>
                  </label>
                </div>
                <div className="row-actions">
                  <button
                    className="primary"
                    onClick={handleSaveEdit}
                    disabled={!editProvider.label || !editProvider.baseUrl || !editProvider.apiKey}
                  >
                    Save
                  </button>
                  <button onClick={handleCancelEdit}>Cancel</button>
                </div>
                {editErrors[p.id] && (
                  <p className="status-line status-line--danger" role="alert">
                    {editErrors[p.id]}
                  </p>
                )}
              </div>
            ) : (
              <div key={p.id} className="provider-row provider-row--card">
                <span className="provider-label-cell">
                  {!p.apiKey && (
                    <span className="key-missing-icon" title="API key missing" aria-label="API key missing">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                  )}
                  <span className="list-row-title">{p.label}</span>
                </span>
                <span className="list-row-meta data">{p.baseUrl}</span>
                <span className="tag">{p.kind}</span>
                <div className="row-actions">
                  <button className="icon-button" onClick={() => handleStartEdit(p)} aria-label="Edit provider" title="Edit provider">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  {!KNOWN_PROVIDER_IDS.has(p.id) && (
                    <button
                      className="icon-button icon-button--danger"
                      onClick={() => handleDelete(p.id)}
                      aria-label="Delete provider"
                      title="Delete provider"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}
                </div>
                {deleteErrors[p.id] && (
                  <p className="status-line status-line--danger" role="alert">
                    {deleteErrors[p.id]}
                  </p>
                )}
              </div>
            )
          )}
        </div>
        {editStatus && (
          <p className={statusTone(editStatus)} role="alert">
            {editStatus}
          </p>
        )}

        {!showAddForm ? (
          <button
            type="button"
            className="icon-button add-toggle"
            onClick={() => setShowAddForm(true)}
            aria-label="Add provider"
            title="Add provider"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        ) : (
          <>
            <label className="quick-add-provider">
              Quick add a known provider
              <select value="" onChange={(e) => handleQuickAdd(e.target.value)}>
                <option value="">— choose a provider — (or fill in the form below manually)</option>
                {KNOWN_PROVIDERS.map((p) => (
                  <option key={p.suggestedId} value={p.suggestedId}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <form className="add-form row-fields" onSubmit={handleAddProvider}>
              <label>
                ID
                <input
                  value={newProvider.id}
                  onChange={(e) => setNewProvider({ ...newProvider, id: e.target.value })}
                  required
                />
              </label>
              <label>
                Label
                <input
                  value={newProvider.label}
                  onChange={(e) => setNewProvider({ ...newProvider, label: e.target.value })}
                  required
                />
              </label>
              <label>
                Base URL
                <input
                  value={newProvider.baseUrl}
                  onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                  required
                />
              </label>
              <label>
                API key
                <input
                  type="password"
                  value={newProvider.apiKey}
                  onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                  required
                />
              </label>
              <label>
                Kind
                <span className="info-icon" title={KIND_HINT} aria-label="How to choose Kind">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
                <select
                  value={newProvider.kind}
                  onChange={(e) => setNewProvider({ ...newProvider, kind: e.target.value as Provider["kind"] })}
                >
                  <option value="openai-compatible">openai-compatible</option>
                  <option value="anthropic">anthropic</option>
                </select>
              </label>
              <div className="row-actions">
                <button type="submit">Add provider</button>
                <button type="button" onClick={handleCancelAdd}>Cancel</button>
              </div>
            </form>
            {addStatus && (
              <p className={statusTone(addStatus)} role="alert">
                {addStatus}
              </p>
            )}
          </>
        )}
      </section>

      <section id="model-assignment">
        <h2>Model assignment</h2>

        <div className="card">
        <div className="stage-grid">
        <div className="stage-block">
          <h3>Curation model</h3>
          <div className="row-fields">
            <label>
              Provider
              <select value={curationProviderId} onChange={(e) => setCurationProviderId(e.target.value)}>
                <option value="">— select provider —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model name
              <input value={curationModel} onChange={(e) => setCurationModel(e.target.value)} />
            </label>
          </div>
          <div className="row-actions">
            <button onClick={handleTestCuration} disabled={isCurationProbing || !curationProviderId || !curationModel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "-2px" }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {isCurationProbing ? "Testing…" : "Test this model"}
            </button>
            {curationProbeResult && <span className={probeTone(curationProbeResult)}>{curationProbeResult}</span>}
          </div>
        </div>

        <div className="stage-block">
          <h3>Drafting model</h3>
          <div className="row-fields">
            <label>
              Provider
              <select value={draftingProviderId} onChange={(e) => setDraftingProviderId(e.target.value)}>
                <option value="">— select provider —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model name
              <input value={draftingModel} onChange={(e) => setDraftingModel(e.target.value)} />
            </label>
          </div>
          <div className="row-actions">
            <button onClick={handleTestDrafting} disabled={isDraftingProbing || !draftingProviderId || !draftingModel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "-2px" }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {isDraftingProbing ? "Testing…" : "Test this model"}
            </button>
            {draftingProbeResult && <span className={probeTone(draftingProbeResult)}>{draftingProbeResult}</span>}
          </div>
        </div>
        </div>

        <div className="section-actions row-actions">
          <button
            className="primary"
            onClick={handleSaveAssignment}
            disabled={(!!curationProviderId && !curationModel) || (!!draftingProviderId && !draftingModel)}
          >
            Save model assignment
          </button>
        </div>
        {assignStatus && (
          <p className={statusTone(assignStatus)} role="alert">
            {assignStatus}
          </p>
        )}
        </div>
      </section>
    </div>
  );
}
