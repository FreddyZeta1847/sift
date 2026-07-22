/**
 * App sidebar — persistent left nav (replaces the old single-row top bar),
 * active route highlighted as a filled pill (see DESIGN.md, "Organic"
 * system). Client Component: active-route detection needs next/navigation's
 * usePathname hook, and Run Now needs live client-side state for its
 * polled progress display.
 *
 * Owns the one global primary action, "Run Now", via the `startRun`/
 * `getRunStatus` Server Actions (see config/settings/actions.ts): startRun
 * hands back a runId immediately and lets the pipeline continue on the
 * server, so this component can poll getRunStatus(runId) on an interval
 * and show the run's live currentStage text while it's in flight — a
 * genuine feature, not cosmetic, since the backend actually reports real
 * progress now (see scripts/run-pipeline.ts).
 *
 * `initialInProgress` (fetched server-side in layout.tsx via
 * lib/review/queries.ts's getInProgressRun) lets the sidebar resume
 * polling immediately on page load if a scheduled/cron-triggered run is
 * already underway — otherwise "is a run running" would only ever be
 * known from this component's own local state, reset to nothing on every
 * fresh page load.
 *
 * Nav links use next/link, not a plain `<a>` — critical since Run Now
 * lives here: a plain `<a>` forces a full page reload on every nav click,
 * which would remount this component and drop its in-flight polling state
 * mid-run. `Link` keeps this component mounted across navigation instead.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startRun, getRunStatus } from "./config/settings/actions";

const LINKS = [
  { href: "/review", label: "Review" },
  { href: "/config/api", label: "API Config" },
  { href: "/config/settings", label: "Settings" },
  { href: "/config/costs", label: "Costs" },
  { href: "/admin", label: "Admin" },
];

const TOAST_MS = 4000;
const POLL_MS = 1500;

function formatRelativeTime(date: Date): string {
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

interface NavProps {
  initialInProgress: { id: number; currentStage: string | null } | null;
  lastRunFinishedAt: Date | null;
  undecidedCount: number;
}

export function Nav({ initialInProgress, lastRunFinishedAt, undecidedCount }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [runningId, setRunningId] = useState<number | null>(initialInProgress?.id ?? null);
  const [stage, setStage] = useState<string | null>(initialInProgress?.currentStage ?? null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const isRunning = runningId !== null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (runningId === null) return;
    const interval = setInterval(async () => {
      const result = await getRunStatus(runningId);
      setStage(result.currentStage);
      if (result.status) {
        clearInterval(interval);
        setRunningId(null);
        setStage(null);
        setToast(
          result.status === "success"
            ? { message: "Run completed.", isError: false }
            : { message: `Run aborted: ${result.abortReason}`, isError: true }
        );
        router.refresh();
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [runningId, router]);

  const handleRunNow = async () => {
    const result = await startRun();
    if (!result.ok || result.runId === undefined) {
      setToast({ message: result.error ?? "Run failed to start", isError: true });
      return;
    }
    setStage(null);
    setRunningId(result.runId);
  };

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-inner">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">S</div>
          <div>
            <div className="sidebar-brand-name">Sift</div>
            <div className="sidebar-brand-tagline">curation pipeline</div>
          </div>
        </div>

        <button className="sidebar-run" onClick={handleRunNow} disabled={isRunning}>
          {isRunning && <span className="sidebar-run-spinner" />}
          <span>{isRunning ? "Running…" : "Run Now"}</span>
        </button>

        {isRunning && stage && (
          <div className="sidebar-stage">
            <span className="sidebar-stage-dot" />
            {stage}
          </div>
        )}

        <nav className="sidebar-nav">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className={active ? "sidebar-nav-item active" : "sidebar-nav-item"}>
                <span className="sidebar-nav-dot" />
                <span className="sidebar-nav-label">{link.label}</span>
                {link.href === "/review" && undecidedCount > 0 && (
                  <span className="sidebar-nav-badge">{undecidedCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {lastRunFinishedAt ? (
            <>
              Last run finished <strong>{formatRelativeTime(lastRunFinishedAt)}</strong>
            </>
          ) : (
            "No runs finished yet"
          )}
          <br />
          {undecidedCount} draft{undecidedCount === 1 ? "" : "s"} awaiting review
        </div>
      </div>

      {toast && (
        <div className={toast.isError ? "toast toast--danger" : "toast"} role="status">
          {toast.message}
        </div>
      )}
    </aside>
  );
}
