// instrumentation.ts
/**
 * Next.js's documented hook for running code once when the server process
 * starts (App Router, stable since Next 14, no config flag needed). This
 * is where sift's scheduler comes alive — see lib/scheduler/init.ts for
 * what it actually does. Migrations run first: this is what makes a fresh
 * clone (or a fresh Docker volume) boot successfully with zero manual
 * setup — see vault-sift/features/DISTRIBUTION-TRUST/DISTRIBUTION-TRUST--oss-packaging.md.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/db/migrate");
    runMigrations();

    const { initializeScheduler } = await import("./lib/scheduler/init");
    await initializeScheduler();
  }
}
