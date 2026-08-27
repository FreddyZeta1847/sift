/**
 * Candidates table (Admin — `/admin/candidates`).
 *
 * Structure comes from AdminTable.tsx, shared with the other three Admin
 * tables. What is specific here is `hasPost`: a candidate a post was
 * drafted from cannot be deleted until that post is. lib/admin/delete.ts's
 * deleteCandidate enforces that server-side; `blockedReason` below
 * surfaces the same rule before the click rather than only as a failure
 * after it, which is a much better click-to-feedback loop.
 *
 * The Source filter's options are the real source list (fetched by
 * page.tsx and passed down), not a hardcoded set — sources are user-owned
 * and change.
 */
"use client";

import { AdminTable, formatAdminDate, type AdminColumn } from "../AdminTable";
import { deleteCandidateAction } from "../actions";
import type { FilterField, FilterValues } from "../../FilterBar";
import type { CandidateRowWithPost } from "../../../lib/admin/queries";

const COLUMNS: AdminColumn<CandidateRowWithPost>[] = [
  { label: "ID", width: "60px", render: (c) => <span className="data">#{c.id}</span> },
  { label: "Chosen", width: "70px", render: (c) => (c.chosen ? "yes" : "no") },
  { label: "Has post", width: "78px", render: (c) => (c.hasPost ? "yes" : "no") },
  { label: "Run", width: "64px", render: (c) => <span className="data">#{c.runId}</span> },
  { label: "Source", width: "minmax(0,110px)", render: (c) => c.sourceName ?? "—" },
  { label: "Created", width: "minmax(0,140px)", render: (c) => <span className="data">{formatAdminDate(c.createdAt)}</span> },
  {
    label: "URL",
    width: "minmax(0,1fr)",
    render: (c) => (
      <a className="data" href={c.url} target="_blank" rel="noopener noreferrer">
        {c.url}
      </a>
    ),
  },
];

function buildFilters(sources: { id: number; name: string }[]): FilterField[] {
  return [
    { key: "id", label: "ID", kind: "number" },
    { key: "runId", label: "Run ID", kind: "number" },
    {
      key: "chosen",
      label: "Chosen",
      kind: "select",
      options: [
        { value: "", label: "any" },
        { value: "true", label: "chosen" },
        { value: "false", label: "unchosen" },
      ],
    },
    {
      key: "sourceId",
      label: "Source",
      kind: "select",
      options: [
        { value: "", label: "any" },
        ...sources.map((s) => ({ value: String(s.id), label: s.name })),
      ],
    },
    { key: "q", label: "Search", kind: "text", placeholder: "url or recap text" },
  ];
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
  filters: FilterValues;
}) {
  return (
    <AdminTable
      title="Candidates"
      basePath="/admin/candidates"
      columns={COLUMNS}
      rows={rows}
      rowId={(c) => c.id}
      filterFields={buildFilters(sources)}
      filterValues={filters}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyMessage="No candidates match these filters."
      emptyHint="Clear a filter above, or check that the sources you expected are enabled in Settings."
      onDelete={{
        action: deleteCandidateAction,
        confirmTitle: "Delete candidate",
        confirmMessage: (c) => <>Delete candidate #{c.id}? This cannot be undone.</>,
        blockedReason: (c) => (c.hasPost ? "Has an associated post — delete the post first." : null),
      }}
    />
  );
}
