/**
 * Posts table (Admin — `/admin/posts`).
 *
 * Structure comes from AdminTable.tsx, shared with the other three Admin
 * tables. Posts are leaf rows — nothing references a post's id (see
 * lib/admin/delete.ts) — so there is no `blockedReason` here, unlike
 * Candidates.
 *
 * `sourceName` (see `PostRowWithSource` / `attachSourceViaCandidate` in
 * lib/admin/queries.ts) is resolved two hops out: a post has no sourceId
 * column of its own, it traces back via candidateId -> candidate.sourceId
 * -> source.name. Candidates shows the same field one hop more directly,
 * since a candidate's sourceId is right there on the row.
 */
"use client";

import { AdminTable, type AdminColumn } from "../AdminTable";
import { deletePostAction } from "../actions";
import type { FilterField, FilterValues } from "../../FilterBar";
import type { PostRowWithSource } from "../../../lib/admin/queries";

const COLUMNS: AdminColumn<PostRowWithSource>[] = [
  { label: "ID", width: "60px", render: (p) => <span className="data">#{p.id}</span> },
  { label: "Title", width: "minmax(0,1fr)", render: (p) => p.title ?? "(untitled)" },
  { label: "Run", width: "64px", render: (p) => <span className="data">#{p.runId}</span> },
  { label: "Source", width: "minmax(0,140px)", render: (p) => p.sourceName ?? "—" },
  { label: "Posted", width: "72px", render: (p) => (p.posted ? "yes" : "no") },
  { label: "Discarded", width: "86px", render: (p) => (p.discarded ? "yes" : "no") },
];

const FILTERS: FilterField[] = [
  { key: "id", label: "ID", kind: "number" },
  { key: "runId", label: "Run ID", kind: "number" },
  {
    key: "posted",
    label: "Posted",
    kind: "select",
    options: [
      { value: "", label: "any" },
      { value: "true", label: "posted" },
      { value: "false", label: "not posted" },
    ],
  },
  {
    key: "discarded",
    label: "Discarded",
    kind: "select",
    options: [
      { value: "", label: "any" },
      { value: "true", label: "discarded" },
      { value: "false", label: "not discarded" },
    ],
  },
  { key: "q", label: "Search", kind: "text", placeholder: "title, url, or text" },
];

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
  filters: FilterValues;
}) {
  return (
    <AdminTable
      title="Posts"
      basePath="/admin/posts"
      columns={COLUMNS}
      rows={rows}
      rowId={(p) => p.id}
      filterFields={FILTERS}
      filterValues={filters}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyMessage="No posts match these filters."
      emptyHint="Clear a filter above, or run the pipeline to draft some."
      onDelete={{
        action: deletePostAction,
        confirmTitle: "Delete post",
        confirmMessage: (p) => <>Delete post #{p.id}? This cannot be undone.</>,
      }}
    />
  );
}
