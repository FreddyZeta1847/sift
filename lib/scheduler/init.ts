// lib/scheduler/init.ts
/**
 * Called once from instrumentation.ts when the Next.js server process
 * starts. Registers the cron job from whatever schedule is currently
 * saved, then runs the missed-run catch-up check. Guarded so a second
 * call (defensive — Next.js's instrumentation hook is documented to fire
 * once per process, but this costs nothing to guard anyway) is a no-op.
 */
import { getSettings } from "../config/settings";
import { registerCronJob } from "./cron";
import { checkMissedRun } from "./catchup";
import { triggerRun } from "./trigger";

let initialized = false;

export async function initializeScheduler(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const settings = await getSettings();
  registerCronJob(settings.scheduleDays, settings.scheduleTime, () => triggerRun("scheduled"));
  await checkMissedRun();
}

export function __resetForTests(): void {
  initialized = false;
}
