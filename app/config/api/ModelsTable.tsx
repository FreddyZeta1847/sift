/**
 * The "Models & pricing" section on the API Config page (`/config/api`).
 *
 * One row per provider+model pair you actually use, with what it costs per
 * million tokens in each direction. The list is the single source for two
 * things at once: the options the model dropdowns offer, and the rates the
 * Costs page and the monthly budget cap work from.
 *
 * Prices are per 1,000,000 tokens because that is how every provider
 * publishes them — a number can be copied straight off a pricing page
 * without arithmetic.
 *
 * A row priced 0/0 means genuinely free (a local model). A model with NO row
 * is a different thing entirely: unknown, not free. Its calls are recorded at
 * $0 because nobody has said otherwise, and they are invisible to the budget
 * cap — which is exactly the silent hole this list exists to close, so the
 * empty state says so out loud rather than looking merely unfinished.
 *
 * Presented as `.list-row`s rather than a <table>: every other list in the
 * app (providers just above this, sources, the Costs breakdown) uses that
 * pattern, and the one table read as though it came from a different product.
 * Adding and editing both happen in an overlay card, so no input ever sits
 * inside the list itself.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addModel, updateModelPrices, deleteModel, fetchProviderModels } from "./actions";
import { Modal } from "../../Modal";
import type { ModelEntry, Provider } from "../../../lib/config/types";

const EMPTY_DRAFT = { providerId: "", model: "", inputPer1M: "", outputPer1M: "" };

type Draft = typeof EMPTY_DRAFT;

interface ModelsTableProps {
  providers: Provider[];
  models: ModelEntry[];
}

export function ModelsTable({ providers, models }: ModelsTableProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // null = closed. "add" = a new row. A ModelEntry = editing that row's prices.
  const [editing, setEditing] = useState<"add" | ModelEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Names the selected provider says it offers. Suggestions only — the field
  // stays free text, so a provider that can't answer costs nothing.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [isFetching, startFetch] = useTransition();

  const rowKey = (m: ModelEntry) => `${m.providerId}/${m.model}`;
  const providerLabel = (id: string) => providers.find((p) => p.id === id)?.label ?? id;

  const openAdd = () => {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setSuggestions([]);
    setFetchNote(null);
    setEditing("add");
  };

  // Provider changed, so any names already fetched belong to a different one.
  const chooseProvider = (providerId: string) => {
    setDraft({ ...draft, providerId, model: "" });
    setSuggestions([]);
    setFetchNote(null);
  };

  const handleFetchModels = () => {
    setFetchNote(null);
    startFetch(async () => {
      const result = await fetchProviderModels(draft.providerId);
      setSuggestions(result.models);
      setFetchNote(
        result.error ?? `${result.models.length} model${result.models.length === 1 ? "" : "s"} available.`
      );
    });
  };

  const openEdit = (m: ModelEntry) => {
    setDraft({
      providerId: m.providerId,
      model: m.model,
      inputPer1M: String(m.inputPer1M),
      outputPer1M: String(m.outputPer1M),
    });
    setError(null);
    setEditing(m);
  };

  const close = () => {
    setEditing(null);
    setError(null);
  };

  const isAdding = editing === "add";

  const handleSubmit = async () => {
    const inputPer1M = Number(draft.inputPer1M) || 0;
    const outputPer1M = Number(draft.outputPer1M) || 0;

    const result = isAdding
      ? await addModel({ providerId: draft.providerId, model: draft.model.trim(), inputPer1M, outputPer1M })
      : await updateModelPrices(draft.providerId, draft.model, inputPer1M, outputPer1M);

    if (!result.ok) {
      // Shown inside the card: the message belongs next to the field that
      // caused it, and closing on failure would throw away the typing.
      setError(result.error ?? "Save failed");
      return;
    }
    setStatus(isAdding ? "Model added." : "Prices updated.");
    close();
    router.refresh();
  };

  const handleDelete = async (m: ModelEntry) => {
    const result = await deleteModel(m.providerId, m.model);
    setStatus(result.ok ? "Model removed." : `Delete failed: ${result.error}`);
    if (result.ok) router.refresh();
  };

  const canSubmit = draft.providerId !== "" && draft.model.trim() !== "";

  return (
    <section id="models-pricing">
      <div className="section-header">
        <h2>Models &amp; pricing</h2>
        <button className="section-action" onClick={openAdd}>
          + Add model
        </button>
      </div>
      <p className="status-line">
        The models you use, and what they cost per 1M tokens. This list fills the model dropdowns above and is what the
        Costs page and your budget cap work from. A local model costs 0; a model that isn&apos;t listed at all is
        unknown rather than free, and its spend is not counted anywhere.
      </p>

      <div className="card">
        {models.length === 0 ? (
          <p className="empty-state">No models listed yet.</p>
        ) : (
          <ul className="list">
            {models.map((m) => (
              <li key={rowKey(m)} className="list-row">
                <span className="list-row-main">
                  <span className="list-row-title data">{m.model}</span>
                  <span className="list-row-meta">
                    {providerLabel(m.providerId)} · in ${m.inputPer1M} / 1M · out ${m.outputPer1M} / 1M
                  </span>
                </span>
                <span className="row-actions">
                  <button onClick={() => openEdit(m)}>Edit</button>
                  <button onClick={() => handleDelete(m)}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {status && (
          <p role="alert" className={/failed/i.test(status) ? "status-line status-line--danger" : "status-line"}>
            {status}
          </p>
        )}
      </div>

      {editing !== null && (
        <Modal
          title={isAdding ? "Add a model" : `Edit prices for ${draft.model}`}
          description={
            isAdding
              ? "Pick the provider you reach it through, then the exact model name that provider expects."
              : "Prices only. Renaming a model would silently retarget any pipeline stage using it, so the pair itself can't be changed here."
          }
          onClose={close}
          footer={
            <>
              <button onClick={close}>Cancel</button>
              <button className="primary" onClick={handleSubmit} disabled={!canSubmit}>
                {isAdding ? "Add model" : "Save prices"}
              </button>
            </>
          }
        >
          <label>
            Provider
            <select
              value={draft.providerId}
              disabled={!isAdding}
              onChange={(e) => chooseProvider(e.target.value)}
            >
              <option value="">— select provider —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Model
            {/* A datalist rather than a <select>: it autocompletes the
                fetched names, still accepts anything typed (so a provider
                that cannot list models, or one whose list is out of date, is
                never a dead end), and copes with the several hundred entries
                OpenRouter returns, which a dropdown would not. */}
            <input
              value={draft.model}
              disabled={!isAdding}
              list="model-suggestions"
              placeholder={suggestions.length > 0 ? "start typing to filter…" : "e.g. gemini-3-flash-preview"}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
            <datalist id="model-suggestions">
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          {isAdding && (
            <div className="row-actions">
              <button onClick={handleFetchModels} disabled={!draft.providerId || isFetching}>
                {isFetching ? "Asking provider…" : "Fetch available models"}
              </button>
              {fetchNote && <span className="status-line">{fetchNote}</span>}
            </div>
          )}

          <div className="modal-field-pair">
            <label>
              $ per 1M input
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.inputPer1M}
                onChange={(e) => setDraft({ ...draft, inputPer1M: e.target.value })}
              />
            </label>
            <label>
              $ per 1M output
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.outputPer1M}
                onChange={(e) => setDraft({ ...draft, outputPer1M: e.target.value })}
              />
            </label>
          </div>

          <p className="status-line">Leave both at 0 for a local model — that records it as genuinely free.</p>

          {error && (
            <p role="alert" className="status-line status-line--danger">
              {error}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
