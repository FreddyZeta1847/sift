/**
 * Pipeline Runs table (Admin — `/admin`).
 *
 * Everything structural — filtering, pagination, delete-with-confirm, the
 * row markup — lives in AdminTable.tsx, which all four Admin tables share.
 * This file declares only what is specific to runs: its five columns, its
 * four filters, and the fact that deleting a run cascades.
 *
 * That cascade is why this table's confirmation says more than the other
 * three: a run owns its candidates and its LLM call records, so deleting
 * one row here removes data that is listed on two other tabs.
 */
"use client";

import { AdminTable, type AdminColumn } from "./AdminTable";
import { LocalTime } from "../LocalTime";
import { deleteRunAction } from "./actions";
import type { FilterField, FilterValues } from "../FilterBar";
import type { RunRow } from "../../lib/review/queries";

const COLUMNS: AdminColumn<RunRow>[] = [
  { label: "ID", width: "60px", render: (r) => <span className="data">#{r.id}</span> },
  { label: "Type", width: "minmax(0,1fr)", render: (r) => r.type },
  {
    label: "Status",
    width: "minmax(0,1fr)",
    // Three genuinely different outcomes that all rendered as the same
    // plain text. A finished run is the good one and gets the green dot;
    // an aborted one is a real failure; "incomplete" is neither — it is a
    // run that never reported back, so it stays muted rather than red.
    render: (r) => {
      const status = r.status ?? "incomplete";
      const text = `${status}${r.abortReason ? ` (${r.abortReason})` : ""}`;
      if (status === "success") return <span className="cell-yes">{text}</span>;
      return <span className={status === "aborted" ? "cell-bad" : "cell-no"}>{text}</span>;
    },
  },
  { label: "Started", width: "minmax(0,1fr)", render: (r) => <LocalTime value={r.startedAt} className="data" /> },
  { label: "Finished", width: "minmax(0,1fr)", render: (r) => <LocalTime value={r.finishedAt} className="data" /> },
];

const FILTERS: FilterField[] = [
  { key: "id", label: "ID", kind: "number" },
  {
    key: "type",
    label: "Type",
    kind: "select",
    options: [
      { value: "", label: "any" },
      { value: "manual", label: "manual" },
      { value: "scheduled", label: "scheduled" },
      { value: "catchup", label: "catchup" },
      { value: "regenerate-posts", label: "regenerate-posts" },
    ],
  },
  {
    key: "status",
    label: "Status",
    kind: "select",
    options: [
      { value: "", label: "any" },
      { value: "success", label: "success" },
      { value: "aborted", label: "aborted" },
      { value: "incomplete", label: "incomplete" },
    ],
  },
  { key: "date", label: "Date", kind: "date" },
];

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
  filters: FilterValues;
}) {
  return (
    <AdminTable
      title="Pipeline Runs"
      basePath="/admin"
      columns={COLUMNS}
      rows={rows}
      rowId={(r) => r.id}
      filterFields={FILTERS}
      filterValues={filters}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyMessage="No runs match these filters."
      emptyHint="Clear a filter above, or trigger a run with Run Now in the sidebar."
      onDelete={{
        action: deleteRunAction,
        confirmTitle: "Delete run",
        confirmMessage: (r) => (
          <>
            Delete run #{r.id}? This also permanently deletes its candidates and LLM call
            records. This cannot be undone.
          </>
        ),
      }}
    />
  );
}
