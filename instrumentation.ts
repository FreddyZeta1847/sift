// instrumentation.ts
/**
 * Next.js's documented hook for running code once when the server process
 * starts (App Router, stable since Next 14, no config flag needed). This
 * is where sift's scheduler comes alive — see lib/scheduler/init.ts for
 * what it actually does. Migrations run first: this is what makes a fresh
 * clone (or a fresh Docker volume) boot successfully with zero manual
 * setup — see vault-sift/features/DISTRIBUTION-TRUST/DISTRIBUTION-TRUST--oss-packaging.md.
 *
 * abortOrphanedRuns() runs next, before the scheduler comes alive: any
 * pipeline_runs row still unfinished from the previous process (a crash,
 * a restart, a redeploy) is definitely dead by the time a new process is
 * booting, so it's marked aborted here rather than left to look
 * permanently "running" to the sidebar's getInProgressRun() forever.
 *
 * The model health check comes last, because it is the only step here that
 * is NOT a prerequisite for serving requests — everything above it must have
 * finished before the first page renders correctly; this one only has to have
 * started. Note it is called, never awaited: Next.js serves nothing until
 * this function resolves, so putting network calls to an LLM provider on that
 * path would hand a slow provider the power to keep the whole app offline.
 * startModelHealthCheck() returns void precisely so that mistake is not
 * expressible here. See ~/.claude/issues/013.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/db/migrate");
    runMigrations();

    const { abortOrphanedRuns } = await import("./scripts/run-pipeline");
    const { aborted } = await abortOrphanedRuns();
    if (aborted > 0) {
      // eslint-disable-next-line no-console
      console.log(`[sift] Marked ${aborted} orphaned in-progress run(s) as aborted (server restart).`);
    }

    const { initializeScheduler } = await import("./lib/scheduler/init");
    await initializeScheduler();

    const { startModelHealthCheck } = await import("./lib/health/model-health");
    startModelHealthCheck();
  }
}
