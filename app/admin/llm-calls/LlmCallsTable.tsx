/**
 * LLM Calls table (Admin — `/admin/llm-calls`).
 *
 * Structure comes from AdminTable.tsx, shared with the other three Admin
 * tables. Leaf rows, so Delete is always allowed (see lib/admin/delete.ts).
 *
 * Cost is the one figure in the app shown to four decimal places. A single
 * call routinely costs a fraction of a cent, and rounding it to the two
 * places the Costs page uses would print most rows as $0.00 — which reads
 * as free rather than as small.
 */
"use client";

import { AdminTable, type AdminColumn } from "../AdminTable";
import { LocalTime } from "../../LocalTime";
import { deleteLlmCallAction } from "../actions";
import type { FilterField, FilterValues } from "../../FilterBar";
import type { LlmCallRow } from "../../../lib/admin/queries";

const COLUMNS: AdminColumn<LlmCallRow>[] = [
  { label: "ID", width: "60px", render: (c) => <span className="data">#{c.id}</span> },
  { label: "Run", width: "64px", render: (c) => <span className="data">#{c.runId}</span> },
  { label: "Provider", width: "minmax(0,1fr)", render: (c) => c.provider },
  { label: "Model", width: "minmax(0,1fr)", render: (c) => c.model },
  { label: "Timestamp", width: "minmax(0,1fr)", render: (c) => <LocalTime value={c.timestamp} className="data" /> },
  {
    label: "Tokens",
    width: "minmax(0,110px)",
    render: (c) => (
      <span className="data">
        {c.inputTokens}/{c.outputTokens}
      </span>
    ),
  },
  { label: "Cost", width: "minmax(0,100px)", render: (c) => <span className="data">${c.estimatedCost.toFixed(4)}</span> },
];

const FILTERS: FilterField[] = [
  { key: "id", label: "ID", kind: "number" },
  { key: "runId", label: "Run ID", kind: "number" },
  { key: "provider", label: "Provider", kind: "text" },
  { key: "model", label: "Model", kind: "text" },
];

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
  filters: FilterValues;
}) {
  return (
    <AdminTable
      title="LLM Calls"
      basePath="/admin/llm-calls"
      columns={COLUMNS}
      rows={rows}
      rowId={(c) => c.id}
      filterFields={FILTERS}
      filterValues={filters}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyMessage="No LLM calls match these filters."
      emptyHint="Clear a filter above. Every pipeline run records its calls here."
      onDelete={{
        action: deleteLlmCallAction,
        confirmTitle: "Delete LLM call record",
        confirmMessage: (c) => <>Delete LLM call record #{c.id}? This cannot be undone.</>,
      }}
    />
  );
}
