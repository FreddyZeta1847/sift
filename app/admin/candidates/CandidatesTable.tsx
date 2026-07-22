/**
 * Candidates table (Admin — `/admin/candidates`). `hasPost` (from
 * lib/admin/queries.ts's listCandidates) pre-disables Delete with an
 * explanation instead of only failing after the click — the same
 * information lib/admin/delete.ts's deleteCandidate enforces server-side,
 * just surfaced earlier for a better click-to-feedback loop.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCandidateAction } from "../actions";
import type { CandidateRowWithPost } from "../../../lib/admin/queries";

// minmax(0, 1fr), not plain 1fr, for the URL column — a plain `1fr` track
// still has an implicit min-content floor that can overflow a long
// unbroken URL; minmax(0, 1fr) lets it actually shrink to the
// overflow:hidden ellipsis on .admin-row > span.
const GRID = "56px 70px 70px 64px minmax(0,110px) minmax(0,140px) minmax(0,1fr) 64px";

// Local time, not UTC — this renders in the browser, so the viewer's own
// timezone is what they expect to see, not the UTC value the DB stores.
function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function CandidatesTable({
  rows,
  total,
  page,
  pageSize,
  sources,
  filters,
}: {
  rows: CandidateRowWithPost[];
  total: number;
  page: number;
  pageSize: number;
  sources: { id: number; name: string }[];
  filters: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});

  const pushFilters = (next: Record<string, string>) => {
    const merged = { ...filters, ...next, page: "1" };
    const params = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    router.push(`/admin/candidates?${params.toString()}`);
  };

  const goToPage = (p: number) => {
    const params = new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    router.push(`/admin/candidates?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete candidate #${id}? This cannot be undone.`)) return;
    const result = await deleteCandidateAction(id);
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
      <h2>Candidates</h2>
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
          Chosen
          <select key={filters.chosen ?? ""} defaultValue={filters.chosen ?? ""} onChange={(e) => pushFilters({ chosen: e.target.value })}>
            <option value="">any</option>
            <option value="true">chosen</option>
            <option value="false">unchosen</option>
          </select>
        </label>
        <label>
          Source
          <select
            key={filters.sourceId ?? ""}
            defaultValue={filters.sourceId ?? ""}
            onChange={(e) => pushFilters({ sourceId: e.target.value })}
          >
            <option value="">any</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            key={filters.q ?? ""}
            placeholder="url or recap text"
            defaultValue={filters.q ?? ""}
            onBlur={(e) => pushFilters({ q: e.target.value })}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">No candidates match these filters.</p>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row--head" style={{ gridTemplateColumns: GRID }}>
            <span>ID</span>
            <span>Chosen</span>
            <span>Has post</span>
            <span>Run</span>
            <span>Source</span>
            <span>Created</span>
            <span>URL</span>
            <span />
          </div>
          {rows.map((c) => (
            <div key={c.id}>
              <div className="admin-row" style={{ gridTemplateColumns: GRID }}>
                <span className="data">#{c.id}</span>
                <span>{c.chosen ? "yes" : "no"}</span>
                <span>{c.hasPost ? "yes" : "no"}</span>
                <span className="data">#{c.runId}</span>
                <span>{c.sourceName ?? "—"}</span>
                <span className="data">{formatDate(c.createdAt)}</span>
                <a className="data" href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.url}
                </a>
                <div className="row-actions">
                  <button className="danger" onClick={() => handleDelete(c.id)} disabled={c.hasPost}>
                    Delete
                  </button>
                </div>
              </div>
              {c.hasPost && (
                <p className="status-line" style={{ marginTop: 0 }}>
                  Has an associated post — delete the post first.
                </p>
              )}
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
