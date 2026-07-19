/**
 * Run picker for the Review Workspace (`/review`) — lets the user browse
 * any past pipeline run's posts, not just today's default. Every run ever
 * executed appears here (see getRecentRuns's docstring: nothing in this app
 * currently deletes a pipeline_runs row), including ones that never
 * finished — labeled "incomplete" rather than hidden, so a crashed/stuck
 * run is something the user can see and account for instead of a silent
 * gap that looks like data loss.
 *
 * A plain `<select>` rather than a custom dropdown: this is exactly the
 * "pick one item from a list, navigate" case a native control handles for
 * free (keyboard nav, screen readers, no popover-positioning code to get
 * right) — see the product register's standard-affordances guidance.
 */
"use client";

import { useRouter } from "next/navigation";
import type { RunSummary } from "../../lib/review/queries";

function formatRunLabel(run: RunSummary): string {
  const started = new Date(run.startedAt).toISOString().slice(0, 16).replace("T", " ");
  const outcome =
    run.status === "success"
      ? `${run.postCount} post${run.postCount === 1 ? "" : "s"}`
      : run.status === "aborted"
        ? `aborted${run.abortReason ? ` (${run.abortReason})` : ""}`
        : "incomplete";
  return `Run #${run.id} — ${started} UTC — ${outcome}`;
}

export function RunPicker({ runs, currentRunId }: { runs: RunSummary[]; currentRunId: number | null }) {
  const router = useRouter();

  if (runs.length === 0) return null;

  return (
    <select
      className="run-picker data"
      aria-label="Select a pipeline run to review"
      value={currentRunId ?? ""}
      onChange={(e) => router.push(`/review?runId=${e.target.value}`)}
    >
      {currentRunId !== null && !runs.some((r) => r.id === currentRunId) && (
        <option value={currentRunId}>Run #{currentRunId} — not in recent history</option>
      )}
      {runs.map((run) => (
        <option key={run.id} value={run.id}>
          {formatRunLabel(run)}
        </option>
      ))}
    </select>
  );
}
