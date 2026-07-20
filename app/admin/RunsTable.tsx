/**
 * Pipeline Runs table (Admin — `/admin`). Filters/pagination are expressed
 * as query params (matches RunPicker.tsx's `router.push` pattern on the
 * Review page); each filter input is `key`ed to its own current filter
 * value so it stays in sync when the URL changes out from under it
 * (e.g. Prev/Next, or a filter edited elsewhere) without needing to lift
 * every field into fully-controlled state.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRunAction } from "./actions";
import type { RunRow } from "../../lib/review/queries";

// minmax(0, 1fr), not fixed px, for the four wide columns — fixed-px grid
// tracks are a hard floor CSS Grid won't shrink below, which overflowed
// the container horizontally (the ellipsis truncation on .admin-row > span
// only works once the column itself can actually shrink).
const GRID = "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 64px";

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

export function RunsTable({
  rows,
  total,
  page,
  pageSize,
  filters,
}: {
  rows: RunRow[];
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
    router.push(`/admin?${params.toString()}`);
  };

  const goToPage = (p: number) => {
    const params = new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    router.push(`/admin?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete run #${id}? This also permanently deletes its candidates and LLM call records. This cannot be undone.`)) {
      return;
    }
    const result = await deleteRunAction(id);
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
      <h2>Pipeline Runs</h2>
      <div className="row-fields">
        <label>
          ID
          <input
            key={filters.id ?? ""}
            type="number"
            defaultValue={filters.id ?? ""}
            onBlur={(e) => pushFilters({ id: e.target.value })}
          />
        </label>
        <label>
          Type
          <select key={filters.type ?? ""} defaultValue={filters.type ?? ""} onChange={(e) => pushFilters({ type: e.target.value })}>
            <option value="">any</option>
            <option value="manual">manual</option>
            <option value="scheduled">scheduled</option>
            <option value="catchup">catchup</option>
            <option value="regenerate-posts">regenerate-posts</option>
          </select>
        </label>
        <label>
          Status
          <select key={filters.status ?? ""} defaultValue={filters.status ?? ""} onChange={(e) => pushFilters({ status: e.target.value })}>
            <option value="">any</option>
            <option value="success">success</option>
            <option value="aborted">aborted</option>
            <option value="incomplete">incomplete</option>
          </select>
        </label>
        <label>
          Date
          <input key={filters.date ?? ""} type="date" defaultValue={filters.date ?? ""} onChange={(e) => pushFilters({ date: e.target.value })} />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">No runs match these filters.</p>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row--head" style={{ gridTemplateColumns: GRID }}>
            <span>ID</span>
            <span>Type</span>
            <span>Status</span>
            <span>Started</span>
            <span>Finished</span>
            <span />
          </div>
          {rows.map((run) => (
            <div key={run.id}>
              <div className="admin-row" style={{ gridTemplateColumns: GRID }}>
                <span className="data">#{run.id}</span>
                <span>{run.type}</span>
                <span>
                  {run.status ?? "incomplete"}
                  {run.abortReason ? ` (${run.abortReason})` : ""}
                </span>
                <span className="data">{formatDate(run.startedAt)}</span>
                <span className="data">{formatDate(run.finishedAt)}</span>
                <div className="row-actions">
                  <button className="danger" onClick={() => handleDelete(run.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {deleteErrors[run.id] && (
                <p className="status-line status-line--danger" role="alert">
                  {deleteErrors[run.id]}
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
