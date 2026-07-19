/**
 * Shared entry point for the two automated trigger sources (cron fire,
 * startup catch-up) — reuses the same isRunning guard and the same
 * runPipeline() already built in Phase 2/3, so this phase adds triggers,
 * not pipeline logic.
 */
import { checkAndSetRunning, clearRunning } from "../pipeline/run-guard";
import { runPipeline } from "../../scripts/run-pipeline";

export async function triggerRun(type: "scheduled" | "catchup"): Promise<void> {
  if (!checkAndSetRunning()) {
    // eslint-disable-next-line no-console
    console.log(`[sift] ${type} trigger: no-op, already running`);
    return;
  }
  try {
    await runPipeline(type);
  } finally {
    clearRunning();
  }
}
