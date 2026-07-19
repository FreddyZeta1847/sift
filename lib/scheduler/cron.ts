// lib/scheduler/cron.ts
/**
 * Registers (and live-re-registers) the in-process node-cron job that
 * fires scheduled pipeline runs. Validates the constructed cron expression
 * BEFORE stopping any previous task, so a bad save never leaves automation
 * silently dead — the old schedule keeps running until a valid new one
 * replaces it. See vault-sift/features/SCHEDULER/SCHEDULER--resilience.md.
 *
 * Uses a namespace import (`import * as cron`), not a default import —
 * this must match the test file's `import * as nodeCron from "node-cron"`
 * exactly, so `vi.spyOn(nodeCron, "schedule")` intercepts the same object
 * this module calls through. A default import here could reference a
 * different object under some ESM/CJS interop configurations and cause
 * the test's mocks to silently miss.
 */
import * as cron from "node-cron";

const DAY_TO_CRON_NUM: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

let currentTask: ReturnType<typeof cron.schedule> | null = null;

export function registerCronJob(
  scheduleDays: string[],
  scheduleTime: string,
  onFire: () => Promise<void>
): void {
  if (scheduleDays.length === 0) {
    if (currentTask) {
      currentTask.stop();
      currentTask = null;
    }
    return;
  }

  const [hour, minute] = scheduleTime.split(":").map(Number);
  const dayNumbers = scheduleDays.map((d) => DAY_TO_CRON_NUM[d]).join(",");
  const expression = `${minute} ${hour} * * ${dayNumbers}`;

  if (!cron.validate(expression)) {
    throw new Error(`Invalid cron expression built from scheduleDays=${JSON.stringify(scheduleDays)}, scheduleTime="${scheduleTime}": "${expression}"`);
  }

  if (currentTask) {
    currentTask.stop();
  }

  currentTask = cron.schedule(
    expression,
    () => {
      onFire().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[sift] Scheduled trigger's onFire callback threw unexpectedly:", err);
      });
    },
    { timezone: "UTC" }
  );
}
