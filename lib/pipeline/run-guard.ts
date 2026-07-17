/**
 * Shared in-memory concurrency guard for anything that triggers a pipeline
 * run outside its own request lifecycle: Regenerate (this phase) and Run
 * Now (this phase), later extended by SCHEDULER (Phase 4) with more
 * trigger sources. Deliberately just a boolean and two functions — do not
 * add missed-run detection or trigger-source tracking here, that's
 * SCHEDULER's job.
 */
let isRunning = false;

export function checkAndSetRunning(): boolean {
  if (isRunning) return false;
  isRunning = true;
  return true;
}

export function clearRunning(): void {
  isRunning = false;
}
