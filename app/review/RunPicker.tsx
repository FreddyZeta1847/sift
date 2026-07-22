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
 *
 * Visual shape matches the Claude Design mockup exactly: a "Pipeline run"
 * label pill wrapping the select, options phrased as a relative day ("today
 * 06:00", "yesterday 06:00") rather than a raw ISO timestamp. The mockup
 * only ever shows successful runs, so the aborted/incomplete suffix below
 * is this app's own addition — real information the mockup never had to
 * account for, kept rather than dropped.
 *
 * This component renders during SSR (it's embedded in review/page.tsx, a
 * Server Component) and then hydrates client-side, so every date/time
 * computation below is pinned to a fixed locale and UTC — `toLocaleTimeString
 * (undefined, ...)` reads the *runtime's* default locale, which differs
 * between the Node server and the browser (24h "18:03" vs. 12h "6:03 PM"),
 * and a bare `new Date(...).getFullYear()` day-boundary check is similarly
 * unsafe across server/client timezones. Either one is a real React
 * hydration mismatch, not a cosmetic risk — this bit us once already.
 */
"use client";

import { useRouter } from "next/navigation";
import type { RunSummary } from "../../lib/review/queries";

function formatRelativeDay(date: Date): string {
  const startOfUTCDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((startOfUTCDay(new Date()) - startOfUTCDay(date)) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatRunLabel(run: RunSummary): string {
  const started = new Date(run.startedAt);
  const day = formatRelativeDay(started);
  const time = started.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  const suffix =
    run.status === "aborted"
      ? ` · aborted${run.abortReason ? ` (${run.abortReason})` : ""}`
      : run.status !== "success"
        ? " · incomplete"
        : "";
  return `Run #${run.id} · ${day} ${time}${suffix}`;
}

export function RunPicker({ runs, currentRunId }: { runs: RunSummary[]; currentRunId: number | null }) {
  const router = useRouter();

  if (runs.length === 0) return null;

  return (
    <label className="run-picker-wrap">
      Pipeline run
      <select
        className="run-picker"
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
    </label>
  );
}
