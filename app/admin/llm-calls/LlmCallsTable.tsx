/**
 * LLM Calls table (Admin — `/admin/llm-calls`). Leaf rows, Delete is
 * always allowed (see lib/admin/delete.ts).
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLlmCallAction } from "../actions";
import type { LlmCallRow } from "../../../lib/admin/queries";

// minmax(0, 1fr) for the six variable-width columns — same reasoning as
// RunsTable.tsx: fixed px grid tracks don't shrink, which overflowed the
// container horizontally.
const GRID = "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 64px";

function formatDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

export function LlmCallsTable({
  rows,
  total,
  page,
  pageSize,
  filters,
}: {
  rows: LlmCallRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});

  const pushFilters = (next: Record<string, string>) => {
    const merged = { ...filters, ...next, page: "1" };
    const params = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    router.push(`/admin/llm-calls?${params.toString()}`);
  };

  const goToPage = (p: number) => {
    const params = new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    router.push(`/admin/llm-calls?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete LLM call record #${id}? This cannot be undone.`)) return;
    const result = await deleteLlmCallAction(id);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section>
      <h2>LLM Calls</h2>
      <div className="row-fields">
        <label>
          ID
          <input key={filters.id ?? ""} type="number" defaultValue={filters.id ?? ""} onBlur={(e) => pushFilters({ id: e.target.value })} />
        </label>
        <label>
          Run ID
          <input
            key={filters.runId ?? ""}
            type="number"
            defaultValue={filters.runId ?? ""}
            onBlur={(e) => pushFilters({ runId: e.target.value })}
          />
        </label>
        <label>
          Provider
          <input
            key={filters.provider ?? ""}
            defaultValue={filters.provider ?? ""}
            onBlur={(e) => pushFilters({ provider: e.target.value })}
          />
        </label>
        <label>
          Model
          <input key={filters.model ?? ""} defaultValue={filters.model ?? ""} onBlur={(e) => pushFilters({ model: e.target.value })} />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">No LLM calls match these filters.</p>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row--head" style={{ gridTemplateColumns: GRID }}>
            <span>ID</span>
            <span>Run</span>
            <span>Provider</span>
            <span>Model</span>
            <span>Timestamp</span>
            <span>Tokens</span>
            <span>Cost</span>
            <span />
          </div>
          {rows.map((c) => (
            <div key={c.id}>
              <div className="admin-row" style={{ gridTemplateColumns: GRID }}>
                <span className="data">#{c.id}</span>
                <span className="data">#{c.runId}</span>
                <span>{c.provider}</span>
                <span>{c.model}</span>
                <span className="data">{formatDate(c.timestamp)}</span>
                <span className="data">
                  {c.inputTokens}/{c.outputTokens}
                </span>
                <span className="data">${c.estimatedCost.toFixed(4)}</span>
                <div className="row-actions">
                  <button className="danger" onClick={() => handleDelete(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {deleteErrors[c.id] && (
                <p className="status-line status-line--danger" role="alert">
                  {deleteErrors[c.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pagination">
        <button onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          Prev
        </button>
        <span className="data">
          Page {page} of {totalPages} ({total} total)
        </span>
        <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </section>
  );
}
