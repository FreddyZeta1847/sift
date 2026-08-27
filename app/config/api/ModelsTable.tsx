/**
 * The "Models & pricing" table on the API Config page (`/config/api`).
 *
 * One row per provider+model pair you actually use, with what it costs per
 * million tokens in each direction. The table is the single source for two
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
 * cap — which is exactly the silent hole this table exists to close, so the
 * empty state says so out loud rather than looking merely unfinished.
 *
 * Interaction follows the provider list above it: local state for the
 * in-progress add form, `router.refresh()` after every successful mutation so
 * the server re-reads config/models.json, and a `<p role="alert">` for status.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addModel, updateModelPrices, deleteModel } from "./actions";
import type { ModelEntry, Provider } from "../../../lib/config/types";

const EMPTY_ROW = { providerId: "", model: "", inputPer1M: "", outputPer1M: "" };

interface ModelsTableProps {
  providers: Provider[];
  models: ModelEntry[];
}

export function ModelsTable({ providers, models }: ModelsTableProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(EMPTY_ROW);
  const [showAdd, setShowAdd] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { inputPer1M: string; outputPer1M: string }>>({});

  const rowKey = (m: ModelEntry) => `${m.providerId}/${m.model}`;
  const providerLabel = (id: string) => providers.find((p) => p.id === id)?.label ?? id;

  const handleAdd = async () => {
    const result = await addModel({
      providerId: draft.providerId,
      model: draft.model.trim(),
      inputPer1M: Number(draft.inputPer1M) || 0,
      outputPer1M: Number(draft.outputPer1M) || 0,
    });
    if (!result.ok) {
      setStatus(`Add failed: ${result.error}`);
      return;
    }
    setDraft(EMPTY_ROW);
    setShowAdd(false);
    setStatus("Model added.");
    router.refresh();
  };

  const handleSavePrices = async (m: ModelEntry) => {
    const edit = edits[rowKey(m)];
    if (!edit) return;
    const result = await updateModelPrices(
      m.providerId,
      m.model,
      Number(edit.inputPer1M) || 0,
      Number(edit.outputPer1M) || 0
    );
    if (!result.ok) {
      setStatus(`Save failed: ${result.error}`);
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      delete next[rowKey(m)];
      return next;
    });
    setStatus("Prices updated.");
    router.refresh();
  };

  const handleDelete = async (m: ModelEntry) => {
    const result = await deleteModel(m.providerId, m.model);
    if (!result.ok) {
      setStatus(`Delete failed: ${result.error}`);
      return;
    }
    setStatus("Model removed.");
    router.refresh();
  };

  const editValue = (m: ModelEntry, field: "inputPer1M" | "outputPer1M"): string =>
    edits[rowKey(m)]?.[field] ?? String(m[field]);

  const setEditValue = (m: ModelEntry, field: "inputPer1M" | "outputPer1M", value: string) =>
    setEdits((prev) => ({
      ...prev,
      [rowKey(m)]: {
        inputPer1M: field === "inputPer1M" ? value : editValue(m, "inputPer1M"),
        outputPer1M: field === "outputPer1M" ? value : editValue(m, "outputPer1M"),
      },
    }));

  return (
    <section id="models-pricing">
      <h2>Models &amp; pricing</h2>
      <p className="status-line">
        The models you use, and what they cost per 1M tokens. This list fills the model dropdowns above and is what the
        Costs page and your budget cap work from. A local model costs 0; a model that isn&apos;t listed at all is
        unknown rather than free, and its spend is not counted anywhere.
      </p>

      <div className="card">
        {models.length === 0 ? (
          <p className="status-line">No models listed yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="models-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>$ / 1M in</th>
                  <th>$ / 1M out</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const dirty = edits[rowKey(m)] !== undefined;
                  return (
                    <tr key={rowKey(m)}>
                      <td>{providerLabel(m.providerId)}</td>
                      <td className="data">{m.model}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editValue(m, "inputPer1M")}
                          onChange={(e) => setEditValue(m, "inputPer1M", e.target.value)}
                          aria-label={`Input price per 1M tokens for ${m.model}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editValue(m, "outputPer1M")}
                          onChange={(e) => setEditValue(m, "outputPer1M", e.target.value)}
                          aria-label={`Output price per 1M tokens for ${m.model}`}
                        />
                      </td>
                      <td className="row-actions">
                        {dirty && <button onClick={() => handleSavePrices(m)}>Save</button>}
                        <button onClick={() => handleDelete(m)}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {showAdd ? (
          <div className="row-fields">
            <label>
              Provider
              <select value={draft.providerId} onChange={(e) => setDraft({ ...draft, providerId: e.target.value })}>
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
              <input
                value={draft.model}
                placeholder="e.g. gemini-3-flash-preview"
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </label>
            <label>
              $ / 1M in
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.inputPer1M}
                onChange={(e) => setDraft({ ...draft, inputPer1M: e.target.value })}
              />
            </label>
            <label>
              $ / 1M out
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.outputPer1M}
                onChange={(e) => setDraft({ ...draft, outputPer1M: e.target.value })}
              />
            </label>
            <div className="row-actions">
              <button onClick={handleAdd} disabled={!draft.providerId || !draft.model.trim()}>
                Add model
              </button>
              <button
                onClick={() => {
                  setDraft(EMPTY_ROW);
                  setShowAdd(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="section-actions row-actions">
            <button onClick={() => setShowAdd(true)}>+ Add model</button>
          </div>
        )}

        {status && <p role="alert" className={/failed/i.test(status) ? "status-line status-line--danger" : "status-line"}>{status}</p>}
      </div>
    </section>
  );
}
