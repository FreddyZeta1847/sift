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
  }
}
