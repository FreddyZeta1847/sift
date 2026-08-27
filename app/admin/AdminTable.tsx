/**
 * The shell all four Admin tables are built from (Pipeline Runs,
 * Candidates, Posts, LLM Calls).
 *
 * WHY IT EXISTS
 * Those four files were the same file four times. Each carried its own
 * copy of `pushFilters`, `goToPage`, the `deleteErrors` map, the
 * head-row/body-row markup, the pagination bar and the `window.confirm`
 * call — differing only in which columns and filters they declared. Four
 * copies of one table is four places a fix has to be remembered.
 *
 * Now each table file declares only what is genuinely its own: its
 * columns, its filters, its delete action and its empty-state wording.
 * Everything below is shared.
 *
 * COLUMN WIDTHS AND THE MOBILE BUG THEY CAUSED
 * Widths arrive as a `--cols` custom property rather than as a
 * `gridTemplateColumns` inline style. That is not cosmetic. An inline
 * `grid-template-columns` cannot be overridden by a media query, so for
 * as long as the widths lived there the four Admin tables had no mobile
 * layout at all — they simply overflowed. Setting a *variable* inline and
 * consuming it in the stylesheet lets `.row`'s breakpoint win. See the
 * `.rows`/`.row` block in globals.css.
 *
 * Every width is `minmax(0, ...)` for the flexible columns. A plain `1fr`
 * or a fixed px track keeps an implicit min-content floor that CSS Grid
 * will not shrink below, which is what used to push a long unbroken URL
 * out past the container instead of ellipsising it.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilterBar, type FilterField, type FilterValues } from "../FilterBar";
import { ConfirmDialog } from "../ConfirmDialog";
import { EmptyState } from "../EmptyState";

export interface AdminColumn<T> {
  label: string;
  /** A CSS grid track. Use minmax(0, …) for anything that must shrink. */
  width: string;
  render: (row: T) => React.ReactNode;
}

export interface AdminDelete<T> {
  action: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /** Dialog title, e.g. "Delete run". */
  confirmTitle: string;
  /** What will happen, in full. Says whether it cascades. */
  confirmMessage: (row: T) => React.ReactNode;
  /**
   * Why this row cannot be deleted, or null if it can. Surfaced before the
   * click rather than only as a failure after it — the same rule
   * lib/admin/delete.ts enforces server-side, just shown earlier.
   */
  blockedReason?: (row: T) => string | null;
}

interface AdminTableProps<T> {
  title: string;
  /** Route this table paginates and filters within, e.g. "/admin/posts". */
  basePath: string;
  columns: AdminColumn<T>[];
  rows: T[];
  rowId: (row: T) => number;
  filterFields: FilterField[];
  filterValues: FilterValues;
  page: number;
  pageSize: number;
  total: number;
  emptyMessage: string;
  emptyHint: string;
  onDelete: AdminDelete<T>;
}

export function AdminTable<T>({
  title,
  basePath,
  columns,
  rows,
  rowId,
  filterFields,
  filterValues,
  page,
  pageSize,
  total,
  emptyMessage,
  emptyHint,
  onDelete,
}: AdminTableProps<T>) {
  const router = useRouter();
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState<T | null>(null);

  const push = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(
      Object.entries(next).filter(([, v]) => v) as [string, string][]
    );
    router.push(`${basePath}?${params.toString()}`);
  };

  // Any filter change resets to page 1 — page 7 of the old result set is
  // meaningless against a new one, and often past its end.
  const applyFilters = (next: FilterValues) => push({ ...next, page: "1" });
  const goToPage = (p: number) => push({ ...filterValues, page: String(p) });

  const runDelete = async (row: T) => {
    const id = rowId(row);
    const result = await onDelete.action(id);
    setConfirming(null);
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
  // The trailing track is the action column.
  const cols = `${columns.map((c) => c.width).join(" ")} 44px`;

  return (
    <section>
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="panel-head-aside data">{total} total</span>
      </div>

      <FilterBar fields={filterFields} values={filterValues} onChange={applyFilters} />

      {rows.length === 0 ? (
        <EmptyState hint={emptyHint}>{emptyMessage}</EmptyState>
      ) : (
        <div className="rows" style={{ ["--cols" as string]: cols } as React.CSSProperties}>
          <div className="row row--head">
            {columns.map((c) => (
              <span key={c.label}>{c.label}</span>
            ))}
            <span />
          </div>

          {rows.map((row) => {
            const id = rowId(row);
            const blocked = onDelete.blockedReason?.(row) ?? null;
            return (
              <div key={id}>
                <div className="row">
                  {columns.map((c) => (
                    <span key={c.label}>{c.render(row)}</span>
                  ))}
                  <span className="row-hover-actions">
                    <button
                      className="icon-button icon-button--danger"
                      onClick={() => setConfirming(row)}
                      disabled={blocked !== null}
                      aria-label={blocked ?? `Delete #${id}`}
                      title={blocked ?? `Delete #${id}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </span>
                </div>
                {blocked && <p className="row-note">{blocked}</p>}
                {deleteErrors[id] && (
                  <p className="row-note status-line--danger" role="alert">
                    {deleteErrors[id]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Only rendered when there is more than one page. A lone
          "Page 1 of 1" under every short table is noise; the row count it
          also carried now lives in the panel head, where it is true
          whether or not paging applies. */}
      {totalPages > 1 && (
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
      )}

      {confirming && (
        <ConfirmDialog
          title={onDelete.confirmTitle}
          message={onDelete.confirmMessage(confirming)}
          confirmLabel="Delete"
          onConfirm={() => runDelete(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
}

/**
 * A row timestamp, in the viewer's own timezone rather than the UTC value
 * the DB stores — this renders in the browser, and local time is what a
 * person reading a row expects to see.
 *
 * Shared because three of the four tables had a byte-identical private
 * copy of it. (Review's RunPicker deliberately does NOT use this: it
 * renders during SSR as well, so it has to pin locale and timezone to
 * avoid a hydration mismatch. See that file's header.)
 */
export function formatAdminDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
