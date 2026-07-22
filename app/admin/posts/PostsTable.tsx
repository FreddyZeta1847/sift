/**
 * Posts table (Admin — `/admin/posts`). Posts are leaf rows (nothing
 * references a post's id — see lib/admin/delete.ts), so Delete here is
 * always allowed, no pre-check needed unlike Candidates.
 *
 * `sourceName` (see `PostRowWithSource` / `attachSourceViaCandidate` in
 * lib/admin/queries.ts) is resolved two hops out — a post has no sourceId
 * column of its own, it traces back via candidateId -> candidate.sourceId
 * -> source.name, the same relationship CandidatesTable.tsx shows more
 * directly since a candidate's sourceId is right there on the row.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePostAction } from "../actions";
import type { PostRowWithSource } from "../../../lib/admin/queries";

// minmax(0, 1fr) for the title column — same reasoning as
// CandidatesTable.tsx's URL column.
const GRID = "56px minmax(0,1fr) 64px minmax(0,140px) 70px 80px 64px";

export function PostsTable({
  rows,
  total,
  page,
  pageSize,
  filters,
}: {
  rows: PostRowWithSource[];
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
    router.push(`/admin/posts?${params.toString()}`);
  };

  const goToPage = (p: number) => {
    const params = new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    router.push(`/admin/posts?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete post #${id}? This cannot be undone.`)) return;
    const result = await deletePostAction(id);
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
      <h2>Posts</h2>
      <div className="row-fields admin-filters">
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
          Posted
          <select key={filters.posted ?? ""} defaultValue={filters.posted ?? ""} onChange={(e) => pushFilters({ posted: e.target.value })}>
            <option value="">any</option>
            <option value="true">posted</option>
            <option value="false">not posted</option>
          </select>
        </label>
        <label>
          Discarded
          <select
            key={filters.discarded ?? ""}
            defaultValue={filters.discarded ?? ""}
            onChange={(e) => pushFilters({ discarded: e.target.value })}
          >
            <option value="">any</option>
            <option value="true">discarded</option>
            <option value="false">not discarded</option>
          </select>
        </label>
        <label>
          Search
          <input
            key={filters.q ?? ""}
            placeholder="title, url, or text"
            defaultValue={filters.q ?? ""}
            onBlur={(e) => pushFilters({ q: e.target.value })}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">No posts match these filters.</p>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row--head" style={{ gridTemplateColumns: GRID }}>
            <span>ID</span>
            <span>Title</span>
            <span>Run</span>
            <span>Source</span>
            <span>Posted</span>
            <span>Discarded</span>
            <span />
          </div>
          {rows.map((p) => (
            <div key={p.id}>
              <div className="admin-row" style={{ gridTemplateColumns: GRID }}>
                <span className="data">#{p.id}</span>
                <span>{p.title ?? "(untitled)"}</span>
                <span className="data">#{p.runId}</span>
                <span>{p.sourceName ?? "—"}</span>
                <span>{p.posted ? "yes" : "no"}</span>
                <span>{p.discarded ? "yes" : "no"}</span>
                <div className="row-actions">
                  <button className="danger" onClick={() => handleDelete(p.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {deleteErrors[p.id] && (
                <p className="status-line status-line--danger" role="alert">
                  {deleteErrors[p.id]}
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
