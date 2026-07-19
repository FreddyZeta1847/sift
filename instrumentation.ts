// instrumentation.ts
/**
 * Next.js's documented hook for running code once when the server process
 * starts (App Router, stable since Next 14, no config flag needed). This
 * is where sift's scheduler comes alive — see lib/scheduler/init.ts for
 * what it actually does.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeScheduler } = await import("./lib/scheduler/init");
    await initializeScheduler();
  }
}
