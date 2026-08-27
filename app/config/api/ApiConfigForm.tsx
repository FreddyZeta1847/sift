/**
 * Interactive form for the API Config page (`/config/api`).
 *
 * Three panels, in the order you need them: the providers you can reach,
 * which model each pipeline stage uses, and what those models cost.
 *
 * Client Component following the same interaction pattern as
 * `app/review/DraftCard.tsx`: local `useState` for form fields and status
 * text, `useRouter().refresh()` after a successful mutation so the Server
 * Component re-fetches fresh `providers`/`settings` props, and a
 * `<StatusMessage>` per panel for both success and failure. Per-stage
 * "Test this model" probes use `useTransition` (mirroring DraftCard's
 * Regenerate) so each button shows a pending label independently while its
 * `probeModelAction` call is in flight. "Save model assignment" is
 * disabled whenever either stage has a provider chosen with no model,
 * preventing a silent blank-model save that would only surface as a
 * failure on the next real pipeline run.
 *
 * The provider list and the two assignment dropdowns render straight from
 * props rather than being copied into local state, so a `router.refresh()`
 * after add/edit/delete immediately reflects the new provider set
 * everywhere it is used. Only in-progress input lives in local state.
 *
 * ADD AND EDIT ARE THE SAME FORM, IN THE SAME PLACE
 * Both open the overlay card (app/Modal.tsx). Editing used to work
 * differently: clicking the pencil swapped that row's text for a grid of
 * inputs in place, so the list jumped, four fields had to fit the width of
 * a row, and two rows could sit half-expanded at once. Worse, those inputs
 * lived in the list rather than a `<form>`, so their `required` attributes
 * enforced nothing and Save needed a hand-written disabled condition to
 * stand in for validation. In a real form the browser does that.
 *
 * The `id` field stays disabled when editing. `updateProvider` matches the
 * row to replace by the submitted id, so letting it be retyped risks a
 * silent no-op or overwriting an unrelated provider — ids are chosen once,
 * when the provider is added.
 *
 * Each provider row leads with its readiness: a red warning icon when
 * `apiKey` is empty on a provider that needs one, a small green dot
 * otherwise. It used to show the warning or nothing at all, which left
 * "not set up" and "ready" looking identical. Delete is hidden for known
 * providers, per `isKnownProvider` — matched by id OR by baseUrl, since a
 * provider added before the known-provider seeding existed (or re-added by
 * hand) can carry a real known endpoint under a custom id. There is no
 * reason to force-remove a default you aren't using; leave its key blank.
 *
 * The API key field is NOT required when adding: a local provider (Ollama)
 * has no key to give, and demanding one made it impossible to add. The
 * Kind field carries an inline info icon whose `title` explains the
 * `anthropic` vs `openai-compatible` distinction (`KIND_HINT`) — the same
 * guidance the README gives, surfaced where the decision is made.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProvider, updateProvider, deleteProvider, assignModels, probeModelAction } from "./actions";
import type { Provider, Settings } from "../../../lib/config/types";
import type { ProbeResult } from "../../../lib/config/test-model-probe";
import { KNOWN_PROVIDERS, providerNeedsApiKey } from "../../../lib/config/known-providers";
import { useModelHealth } from "../../health/ModelHealthProvider";
import { Modal } from "../../Modal";
import { ConfirmDialog } from "../../ConfirmDialog";
import { StatusMessage } from "../../StatusMessage";
import { EmptyState } from "../../EmptyState";
import { ModelSelect } from "./ModelSelect";
import { ModelsTable } from "./ModelsTable";
import type { ModelEntry } from "../../../lib/config/types";

const EMPTY_PROVIDER = {
  id: "",
  label: "",
  baseUrl: "",
  apiKey: "",
  kind: "openai-compatible" as Provider["kind"],
};

type ProviderDraft = typeof EMPTY_PROVIDER;

const KNOWN_PROVIDER_IDS = new Set(KNOWN_PROVIDERS.map((p) => p.suggestedId));
// A provider added before the known-provider seeding feature existed (or
// re-added by hand) can have a real known baseUrl under a custom/legacy
// id — matching by id alone missed these, so also recognize a known
// service by its endpoint, which is the more stable signal anyway.
const KNOWN_PROVIDER_BASE_URLS = new Set(KNOWN_PROVIDERS.map((p) => p.baseUrl));

function isKnownProvider(p: Provider): boolean {
  return KNOWN_PROVIDER_IDS.has(p.id) || KNOWN_PROVIDER_BASE_URLS.has(p.baseUrl);
}

const KIND_HINT =
  "anthropic = Anthropic's own API (Base URL is ignored — the SDK always targets Anthropic's endpoint, only the key matters). " +
  "openai-compatible = everything else: OpenAI itself, and any provider whose endpoint matches OpenAI's request/response shape " +
  "(Google Gemini, NVIDIA NIM, OpenRouter, DeepSeek, etc.) — use their real Base URL.";

// Visual-only helpers for a "test this model" probe result. "pass" is the
// only outcome that means "safe to assign", but the failures are NOT
// interchangeable, so they do not all render the same red word.
//
// "inconclusive" in particular is deliberately muted, not `--danger`: it
// means this test stopped waiting, not that the model is broken. Painting it
// red is exactly the false alarm this vocabulary exists to prevent — see the
// header of lib/config/test-model-probe.ts.
const PROBE_LABELS: Record<ProbeResult, string> = {
  pass: "pass",
  fail: "bad output",
  unreachable: "unreachable",
  timeout: "provider timed out",
  inconclusive: "no answer yet",
};

const PROBE_EXPLANATIONS: Record<ProbeResult, string> = {
  pass: "The model returned valid structured output.",
  fail: "The model answered, but not with the structured output the pipeline needs — try a stronger model.",
  unreachable: "The call failed. Check the API key, the base URL and the model name.",
  timeout: "The provider was given its full time allowance and never responded.",
  inconclusive:
    "The test stopped waiting before the provider answered. This is not a failure — raise the test limit in Settings to wait longer.",
};

function probeTone(result: ProbeResult): string {
  if (result === "pass") return "data status-line--success";
  if (result === "inconclusive") return "data status-line";
  return "data status-line--danger";
}

const InfoIcon = () => (
  <span className="info-icon" title={KIND_HINT} aria-label="How to choose Kind">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  </span>
);

export function ApiConfigForm({
  providers,
  settings,
  models,
}: {
  providers: Provider[];
  settings: Settings;
  models: ModelEntry[];
}) {
  const router = useRouter();
  // Same lock as Run Now in the sidebar, from the same context so the two can
  // never disagree — see app/health/ModelHealthProvider.tsx.
  const { actionsLocked } = useModelHealth();

  // null = no overlay. "add" = adding. A Provider = editing that one.
  const [editing, setEditing] = useState<"add" | Provider | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_PROVIDER);
  const [formError, setFormError] = useState<string | null>(null);
  // Tracked with its tone rather than inferred from the wording: this
  // component knows whether a save succeeded, so guessing from the string
  // would be throwing away information it already has.
  const [providerStatus, setProviderStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<Provider | null>(null);

  const [curationProviderId, setCurationProviderId] = useState(settings.curationProviderId ?? "");
  const [curationModel, setCurationModel] = useState(settings.curationModel ?? "");
  const [draftingProviderId, setDraftingProviderId] = useState(settings.draftingProviderId ?? "");
  const [draftingModel, setDraftingModel] = useState(settings.draftingModel ?? "");
  const [assignStatus, setAssignStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const [curationProbeResult, setCurationProbeResult] = useState<ProbeResult | null>(null);
  const [draftingProbeResult, setDraftingProbeResult] = useState<ProbeResult | null>(null);
  const [isCurationProbing, startCurationProbe] = useTransition();
  const [isDraftingProbing, startDraftingProbe] = useTransition();

  const isAdding = editing === "add";

  const openAdd = () => {
    setDraft(EMPTY_PROVIDER);
    setFormError(null);
    setEditing("add");
  };

  const openEdit = (p: Provider) => {
    setDraft({ ...p });
    setFormError(null);
    setEditing(p);
  };

  const closeForm = () => {
    setEditing(null);
    setDraft(EMPTY_PROVIDER);
    setFormError(null);
  };

  const handleQuickAdd = (suggestedId: string) => {
    if (!suggestedId) return;
    const preset = KNOWN_PROVIDERS.find((p) => p.suggestedId === suggestedId);
    if (!preset) return;
    setDraft({ id: preset.suggestedId, label: preset.label, baseUrl: preset.baseUrl, apiKey: "", kind: preset.kind });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = isAdding ? await addProvider(draft) : await updateProvider(draft);
    if (!result.ok) {
      // Shown inside the card: closing on failure would throw away the
      // typing that caused it.
      setFormError(result.error ?? (isAdding ? "Add failed" : "Update failed"));
      return;
    }
    setProviderStatus({ text: isAdding ? "Provider added." : "Provider updated.", ok: true });
    closeForm();
    router.refresh();
  };

  const handleDelete = async (p: Provider) => {
    const result = await deleteProvider(p.id);
    setConfirmDelete(null);
    if (!result.ok) {
      setDeleteErrors((prev) => ({ ...prev, [p.id]: result.error ?? "Delete failed" }));
      return;
    }
    setDeleteErrors((prev) => {
      const { [p.id]: _removed, ...rest } = prev;
      return rest;
    });
    setProviderStatus({ text: "Provider removed.", ok: true });
    router.refresh();
  };

  const handleSaveAssignment = async () => {
    const result = await assignModels({ curationProviderId, curationModel, draftingProviderId, draftingModel });
    if (!result.ok) {
      setAssignStatus({ text: `Save failed: ${result.error}`, ok: false });
      return;
    }
    setAssignStatus({ text: "Model assignment saved.", ok: true });
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
      <section className="panel" id="providers">
        <div className="panel-head">
          <h2>Providers</h2>
          <button className="section-action panel-head-aside" onClick={openAdd}>
            + Add provider
          </button>
        </div>

        {providers.length === 0 ? (
          <EmptyState hint="Add one above — most are one click from the known-provider list.">
            No providers configured yet.
          </EmptyState>
        ) : (
          <div className="rows" style={{ ["--cols" as string]: "minmax(0,1fr) minmax(0,1.6fr) auto 84px" } as React.CSSProperties}>
            <div className="row row--head">
              <span>Label</span>
              <span>Base URL</span>
              <span>Kind</span>
              <span />
            </div>
            {providers.map((p) => (
              <div key={p.id}>
                <div className="row">
                  <span className="provider-label-cell">
                    {/* A blank key means "not set up yet" for a hosted provider,
                        but a local one (Ollama) has no key to set — warning
                        there would be permanent and wrong. */}
                    {!p.apiKey && providerNeedsApiKey(p) ? (
                      <span className="key-missing-icon" title="API key missing" aria-label="API key missing">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </span>
                    ) : (
                      // The other half of the same signal. Without it the
                      // column says "something is wrong here" or says
                      // nothing at all, and nothing is not the same as
                      // "this one is ready to use".
                      <span className="ready-dot" title="Ready to use" aria-label="Ready to use" />
                    )}
                    <span className="row-title">{p.label}</span>
                  </span>
                  <span className="row-meta data">{p.baseUrl}</span>
                  <span className="tag">{p.kind}</span>
                  <span className="row-actions row-hover-actions">
                    <button className="icon-button" onClick={() => openEdit(p)} aria-label="Edit provider" title="Edit provider">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    {!isKnownProvider(p) && (
                      <button
                        className="icon-button icon-button--danger"
                        onClick={() => setConfirmDelete(p)}
                        aria-label="Delete provider"
                        title="Delete provider"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    )}
                  </span>
                </div>
                {deleteErrors[p.id] && (
                  <p className="row-note status-line--danger" role="alert">
                    {deleteErrors[p.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <StatusMessage message={providerStatus?.text} tone={providerStatus?.ok ? "success" : "danger"} />
      </section>

      <section className="panel" id="model-assignment">
        <div className="panel-head">
          <h2>Model assignment</h2>
        </div>
        <p className="panel-intro">
          Which model each pipeline stage calls. Curation picks what is worth posting; drafting writes it.
        </p>

        <div className="panel-grid">
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
              <ModelSelect
                providerId={curationProviderId}
                models={models}
                value={curationModel}
                onChange={setCurationModel}
              />
            </div>
            <div className="row-actions">
              <button
                className={actionsLocked ? "is-locked" : undefined}
                onClick={handleTestCuration}
                disabled={isCurationProbing || actionsLocked || !curationProviderId || !curationModel}
                title={actionsLocked ? "Testing models — available in a moment" : undefined}
              >
                <svg className="button-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {isCurationProbing || actionsLocked ? "Testing…" : "Test this model"}
              </button>
              {curationProbeResult && (
                <span className={probeTone(curationProbeResult)} title={PROBE_EXPLANATIONS[curationProbeResult]}>
                  {PROBE_LABELS[curationProbeResult]}
                </span>
              )}
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
              <ModelSelect
                providerId={draftingProviderId}
                models={models}
                value={draftingModel}
                onChange={setDraftingModel}
              />
            </div>
            <div className="row-actions">
              <button
                className={actionsLocked ? "is-locked" : undefined}
                onClick={handleTestDrafting}
                disabled={isDraftingProbing || actionsLocked || !draftingProviderId || !draftingModel}
                title={actionsLocked ? "Testing models — available in a moment" : undefined}
              >
                <svg className="button-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {isDraftingProbing || actionsLocked ? "Testing…" : "Test this model"}
              </button>
              {draftingProbeResult && (
                <span className={probeTone(draftingProbeResult)} title={PROBE_EXPLANATIONS[draftingProbeResult]}>
                  {PROBE_LABELS[draftingProbeResult]}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="panel-foot">
          <StatusMessage message={assignStatus?.text} tone={assignStatus?.ok ? "success" : "danger"} />
          <button
            className="primary"
            onClick={handleSaveAssignment}
            disabled={(!!curationProviderId && !curationModel) || (!!draftingProviderId && !draftingModel)}
          >
            Save model assignment
          </button>
        </div>
      </section>

      {/* Below the assignment on purpose: it is what the dropdowns above read
          from, so the reading order matches the order you notice you need it
          ("no models listed for this provider yet" -> the table is right
          there). */}
      <ModelsTable providers={providers} models={models} />

      {editing !== null && (
        <Modal
          title={isAdding ? "Add a provider" : `Edit ${draft.label || "provider"}`}
          description={
            isAdding
              ? "Pick a known service to fill the endpoint in for you, or type the details yourself."
              : "The id can't be changed — it is what every model and pipeline stage points at."
          }
          onClose={closeForm}
          footer={
            <>
              <button type="button" className="secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" form="provider-form" className="primary">
                {isAdding ? "Add provider" : "Save changes"}
              </button>
            </>
          }
        >
          {isAdding && (
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
          )}

          {/* The submit button lives in the modal footer, outside this
              element, so it is wired back by the form="" attribute — that
              keeps Enter-to-submit working without nesting the footer
              inside the form. Being a real <form> is also what makes the
              `required` attributes below actually enforce anything; the
              old inline edit row sat in a <ul>, where they did nothing. */}
          <form id="provider-form" className="modal-form" onSubmit={handleSubmit}>
            <div className="modal-field-pair">
              <label>
                ID
                <input
                  value={draft.id}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  disabled={!isAdding}
                  required
                />
              </label>
              <label>
                Label
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Base URL
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                required
              />
            </label>
            <label>
              API key
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              />
            </label>
            <label>
              Kind
              <InfoIcon />
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Provider["kind"] })}
              >
                <option value="openai-compatible">openai-compatible</option>
                <option value="anthropic">anthropic</option>
              </select>
            </label>
            <StatusMessage message={formError} tone="danger" />
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete provider"
          message={
            <>
              Delete {confirmDelete.label}? Any model priced against it, and any pipeline stage
              assigned to it, will stop resolving. This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
