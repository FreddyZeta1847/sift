# Phase 4 — Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sift run itself on a schedule with zero manual intervention — `node-cron` inside the same Next.js server process, a 24h missed-run catch-up check on startup, and the `isRunning` concurrency guard (already built in Phase 3) extended to cover these two new trigger sources alongside the existing "Run Now" and "Regenerate Posts".

**Architecture:** `node-cron` registers a job on server startup (via Next.js's `instrumentation.ts` hook — the standard way to run code once when the server process starts, no custom server file needed) and re-registers live whenever the Settings page saves a new schedule. A scheduled fire or a missed-run catch-up both funnel through the exact same `runPipeline()` function Phase 2/3 already built and already accept `"scheduled"`/`"catchup"` as valid `type` values — this phase adds triggers, not pipeline logic.

**Tech Stack:** `node-cron` (new dependency, chosen in the vault design as the lightest in-process cron library — no Redis, no OS-level cron, no second process), Next.js `instrumentation.ts`.

## Global Constraints

- **No new pipeline logic.** Scheduled/catchup runs call the existing `runPipeline(type)` from `scripts/run-pipeline.ts` unchanged — this phase only decides *when* it gets called.
- **One `isRunning` guard, four trigger sources now.** Cron fire and startup catch-up must use the exact same `checkAndSetRunning()`/`clearRunning()` from `lib/pipeline/run-guard.ts` that Run Now and Regenerate Posts already use — do not create a second guard.
- **A trigger arriving while `isRunning` is `true` is a silent no-op** — console log only, never surfaced as an error, never queued or retried.
- **No auto-retry on a failed/aborted run** — wait for the next scheduled slot or a manual Run Now.
- **Registration failures must fail loudly.** If the cron job can't be registered at startup, throw a clear error rather than letting the server come up with silently-dead automation.
- **Missed-run catch-up is a simple time comparison, not a queue** — at most one catch-up run ever fires per startup, for the single most recent missed slot. A slot older than 24h is silently skipped.
- **New decision, not in the original vault**: `settings.json` gets a new `scheduleTime` field (`"HH:MM"`, 24h format, UTC) alongside the existing `scheduleDays`, with a corresponding time-picker input added to the Settings page — the original design only stored days with no time, which doesn't work for an actual cron expression. Default: `"09:00"`.
- **Live re-registration, closing a Phase 3 gap.** Phase 3's `saveSchedule` action deliberately only persisted `scheduleDays` (no scheduler existed yet). This phase retrofits it to also call the new live cron-registration function after a successful save, fulfilling the original "saving a schedule change re-registers the job live, no restart needed" requirement. If re-registration itself fails, the action must surface that error and leave the previous schedule's job running — never report success while silently leaving the old schedule active.

---

### Task 1: `scheduleTime` field + Settings page time picker

**Files:**
- Modify: `lib/config/types.ts`
- Modify: `lib/config/settings.ts`
- Modify: `app/config/settings/actions.ts`
- Modify: `app/config/settings/SettingsForm.tsx`
- Test: `lib/config/settings.test.ts` (update existing cases)
- Test: `app/config/settings/actions.test.ts` (update `saveSchedule` test)

**Interfaces:**
- Produces: `Settings.scheduleTime: string` (new field, `"HH:MM"` 24h UTC, default `"09:00"`). `saveSchedule(scheduleDays: string[], scheduleTime: string): Promise<ActionResult>` (signature widened — was `saveSchedule(scheduleDays: string[])`).

- [ ] **Step 1: Read the current files first**

Read `lib/config/types.ts`, `lib/config/settings.ts`, `app/config/settings/actions.ts`, `app/config/settings/actions.test.ts`, and `app/config/settings/SettingsForm.tsx` in full before editing any of them — all were built in Phase 3 and have their own established patterns (rollback-on-failure, `safeWrite`) that must be preserved, not rewritten.

- [ ] **Step 2: Add the field to the type and default**

Edit `lib/config/types.ts`, add `scheduleTime: string;` to the `Settings` interface, right after `scheduleDays: string[];`.

Edit `lib/config/settings.ts`, add `scheduleTime: "09:00",` to `DEFAULT_SETTINGS` right after `scheduleDays: [],`.

- [ ] **Step 3: Update the existing settings test**

Edit `lib/config/settings.test.ts` — add an assertion for the new default in the existing "returns blank defaults by default" test:

```typescript
expect(result.scheduleTime).toBe("09:00");
```

Add it right after the existing `expect(result.scheduleDays).toEqual([]);` line. Also update the `saveSettings` test's `custom` object (in the same file, from Phase 3's Task 7 work) to include `scheduleTime: "14:30"` so the round-trip test still covers every field.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- lib/config/settings.test.ts`
Expected: FAIL — `scheduleTime` is `undefined`, not `"09:00"`/`"14:30"`

- [ ] **Step 5: Run test to verify it passes**

(No code change needed beyond Step 2 — this step just confirms.)
Run: `npm test -- lib/config/settings.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing test for the widened `saveSchedule`**

Edit `app/config/settings/actions.test.ts` — update the existing `"saveSchedule persists scheduleDays only"` test:

```typescript
it("saveSchedule persists scheduleDays and scheduleTime", async () => {
  const result = await saveSchedule(["mon", "wed"], "14:30");
  expect(result.ok).toBe(true);
  const settings = await getSettings();
  expect(settings.scheduleDays).toEqual(["mon", "wed"]);
  expect(settings.scheduleTime).toBe("14:30");
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- app/config/settings/actions.test.ts`
Expected: FAIL — `saveSchedule` doesn't accept a second argument / doesn't persist it

- [ ] **Step 8: Widen `saveSchedule`**

Edit `app/config/settings/actions.ts` — find the existing `saveSchedule` function (it already routes through `safeWrite` per Phase 3's final fix round; preserve that):

```typescript
export async function saveSchedule(scheduleDays: string[], scheduleTime: string): Promise<ActionResult> {
  const settings = await getSettings();
  return safeWrite(() => saveSettings({ ...settings, scheduleDays, scheduleTime }));
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- app/config/settings/actions.test.ts`
Expected: PASS

- [ ] **Step 10: Add a time input to the Settings page**

Edit `app/config/settings/SettingsForm.tsx`. Read the existing Schedule section first — it currently has 7 day checkboxes calling `saveSchedule(nextDays)` on each toggle, plus local `scheduleDays` state with the rollback-on-failure pattern from the Phase 3 fix round. Add:
- A `scheduleTime` local state, initialized from `settings.scheduleTime`.
- A `<input type="time">` bound to it, calling `saveSchedule(scheduleDays, e.target.value)` on change, with the same rollback-on-failure pattern already used for the day checkboxes (capture previous value, revert if `!result.ok`).
- Update every existing call site of `saveSchedule(nextDays)` in this file to `saveSchedule(nextDays, scheduleTime)` (the day-toggle handler needs to pass the current time value too now that the signature takes both).
- Keep the existing honest note about the schedule not taking live effect — but now it's becoming true in a later task of this same phase, so soften it to something like "Schedule changes apply the next time the scheduler checks in." (This task doesn't wire live re-registration yet — that's Task 5 — so don't overclaim here; just avoid the old "not built yet" phrasing since it will stop being accurate very soon in this same phase. If in doubt, leave the existing copy as-is; it's not wrong yet, just about to become conservative-but-still-true.)

- [ ] **Step 11: Manually verify in the dev server**

Run: `npm run dev`, open `/config/settings`, change the time, confirm `config/settings.json` updates with the new `scheduleTime`. Toggle a day, confirm both `scheduleDays` and the current `scheduleTime` persist together. Stop the dev server before finishing.

- [ ] **Step 12: Run the full suite and tsc**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 13: Commit**

```bash
git add lib/config/types.ts lib/config/settings.ts lib/config/settings.test.ts app/config/settings/actions.ts app/config/settings/actions.test.ts app/config/settings/SettingsForm.tsx
git commit -m "feat: add scheduleTime setting and Settings page time picker"
```

---

### Task 2: Cron registration module

**Files:**
- Create: `lib/scheduler/cron.ts`
- Test: `lib/scheduler/cron.test.ts`
- Modify: `package.json` (new dependency)

**Interfaces:**
- Produces: `registerCronJob(scheduleDays: string[], scheduleTime: string, onFire: () => Promise<void>): void`.

- [ ] **Step 1: Install `node-cron`**

Run: `npm install node-cron`
Run: `npm install --save-dev @types/node-cron` (only if `node-cron`'s own package doesn't ship types — check `node_modules/node-cron/package.json` for a `"types"` field first; if it already provides its own types, skip the `@types` package and note that in your report).

- [ ] **Step 2: Write the failing test**

Create `lib/scheduler/cron.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import * as nodeCron from "node-cron";
import { registerCronJob } from "./cron";

describe("registerCronJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    registerCronJob([], "09:00", async () => {}); // reset to no active job between tests
  });

  it("registers a cron task when scheduleDays is non-empty", () => {
    const scheduleSpy = vi.spyOn(nodeCron, "schedule");
    registerCronJob(["mon", "wed", "fri"], "09:00", async () => {});
    expect(scheduleSpy).toHaveBeenCalledWith("0 9 * * 1,3,5", expect.any(Function), expect.objectContaining({ timezone: "UTC" }));
  });

  it("stops any previous task before registering a new one", () => {
    const stopSpy = vi.fn();
    vi.spyOn(nodeCron, "schedule").mockReturnValue({ stop: stopSpy } as unknown as ReturnType<typeof nodeCron.schedule>);
    registerCronJob(["mon"], "09:00", async () => {});
    registerCronJob(["tue"], "10:00", async () => {});
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("does not register a task when scheduleDays is empty, and stops any existing one", () => {
    const stopSpy = vi.fn();
    vi.spyOn(nodeCron, "schedule").mockReturnValue({ stop: stopSpy } as unknown as ReturnType<typeof nodeCron.schedule>);
    registerCronJob(["mon"], "09:00", async () => {});
    const scheduleSpy = vi.spyOn(nodeCron, "schedule");
    registerCronJob([], "09:00", async () => {});
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("throws instead of registering when the constructed expression is invalid, leaving any previous task running", () => {
    const stopSpy = vi.fn();
    vi.spyOn(nodeCron, "schedule").mockReturnValue({ stop: stopSpy } as unknown as ReturnType<typeof nodeCron.schedule>);
    registerCronJob(["mon"], "09:00", async () => {});

    expect(() => registerCronJob(["mon"], "not-a-time", async () => {})).toThrow();
    expect(stopSpy).not.toHaveBeenCalled(); // previous task was never stopped, since the new one never validated
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/scheduler/cron.test.ts`
Expected: FAIL with "Cannot find module './cron'"

- [ ] **Step 4: Implement the registration module**

Create `lib/scheduler/cron.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/scheduler/cron.test.ts`
Expected: PASS (4/4)

- [ ] **Step 6: Run the full suite and tsc**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/scheduler/cron.ts lib/scheduler/cron.test.ts
git commit -m "feat: add node-cron registration module"
```

---

### Task 3: Trigger wiring (scheduled/catchup)

**Files:**
- Create: `lib/scheduler/trigger.ts`
- Test: `lib/scheduler/trigger.test.ts`

**Interfaces:**
- Consumes: `checkAndSetRunning`/`clearRunning` from `lib/pipeline/run-guard.ts`, `runPipeline` from `scripts/run-pipeline.ts`.
- Produces: `triggerRun(type: "scheduled" | "catchup"): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `lib/scheduler/trigger.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { triggerRun } from "./trigger";
import * as runPipelineModule from "../../scripts/run-pipeline";
import * as runGuardModule from "../pipeline/run-guard";

describe("triggerRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    runGuardModule.clearRunning();
  });

  it("calls runPipeline with the given type when not already running", async () => {
    const pipelineSpy = vi.spyOn(runPipelineModule, "runPipeline").mockResolvedValue({ status: "success" });

    await triggerRun("scheduled");

    expect(pipelineSpy).toHaveBeenCalledWith("scheduled");
  });

  it("is a silent no-op if a run is already in progress", async () => {
    runGuardModule.checkAndSetRunning();
    const pipelineSpy = vi.spyOn(runPipelineModule, "runPipeline");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await triggerRun("catchup");

    expect(pipelineSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("no-op"));
  });

  it("clears the run guard even if runPipeline throws", async () => {
    vi.spyOn(runPipelineModule, "runPipeline").mockRejectedValue(new Error("unexpected"));

    await expect(triggerRun("scheduled")).rejects.toThrow("unexpected");
    expect(runGuardModule.checkAndSetRunning()).toBe(true); // guard was released
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/scheduler/trigger.test.ts`
Expected: FAIL with "Cannot find module './trigger'"

- [ ] **Step 3: Implement**

Create `lib/scheduler/trigger.ts`:

```typescript
// lib/scheduler/trigger.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/scheduler/trigger.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Run the full suite and tsc**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/scheduler/trigger.ts lib/scheduler/trigger.test.ts
git commit -m "feat: add shared trigger for scheduled/catchup pipeline runs"
```

---

### Task 4: Missed-run catch-up

**Files:**
- Create: `lib/scheduler/catchup.ts`
- Test: `lib/scheduler/catchup.test.ts`

**Interfaces:**
- Consumes: `getSettings` from `lib/config/settings.ts`, `triggerRun` from `lib/scheduler/trigger.ts`, `pipelineRunsTable` from `lib/db/schema.ts`.
- Produces: `mostRecentExpectedSlot(scheduleDays: string[], scheduleTime: string, now: Date): Date | null`. `checkMissedRun(): Promise<void>`.

- [ ] **Step 1: Write the failing test for the slot computation**

Create `lib/scheduler/catchup.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { mostRecentExpectedSlot, checkMissedRun } from "./catchup";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable } from "../db/schema";
import * as settingsModule from "../config/settings";
import * as triggerModule from "./trigger";

describe("mostRecentExpectedSlot", () => {
  it("returns null when scheduleDays is empty", () => {
    expect(mostRecentExpectedSlot([], "09:00", new Date("2026-07-19T12:00:00.000Z"))).toBeNull();
  });

  it("finds today's slot when now is after today's scheduled time and today is a scheduled day", () => {
    // 2026-07-19 is a Sunday
    const now = new Date("2026-07-19T15:00:00.000Z");
    const slot = mostRecentExpectedSlot(["sun"], "09:00", now);
    expect(slot?.toISOString()).toBe("2026-07-19T09:00:00.000Z");
  });

  it("walks back to the most recent prior scheduled day when today isn't one and/or today's slot hasn't happened yet", () => {
    // 2026-07-19 is a Sunday; schedule is Friday only; most recent Friday before this Sunday is 2026-07-17
    const now = new Date("2026-07-19T12:00:00.000Z");
    const slot = mostRecentExpectedSlot(["fri"], "09:00", now);
    expect(slot?.toISOString()).toBe("2026-07-17T09:00:00.000Z");
  });

  it("does not return a slot later than now on a scheduled day", () => {
    // 2026-07-19 is a Sunday, scheduled for 09:00, but now is 08:00 same day — today's slot hasn't happened yet
    const now = new Date("2026-07-19T08:00:00.000Z");
    const slot = mostRecentExpectedSlot(["sun"], "09:00", now);
    expect(slot?.toISOString()).toBe("2026-07-12T09:00:00.000Z"); // the previous Sunday
  });
});

const testDbPath = "data/test-scheduler-catchup.db";

describe("checkMissedRun", () => {
  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("does nothing when no schedule is configured", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [], scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun");

    await checkMissedRun();

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("fires a catchup run when the most recent slot is unmatched and within 24h", async () => {
    const now = new Date();
    const recentSlot = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][recentSlot.getUTCDay()];
    const hh = String(recentSlot.getUTCHours()).padStart(2, "0");
    const mm = String(recentSlot.getUTCMinutes()).padStart(2, "0");

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [dayName], scheduleTime: `${hh}:${mm}`,
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun").mockResolvedValue(undefined);

    await checkMissedRun();

    expect(triggerSpy).toHaveBeenCalledWith("catchup");
  });

  it("does not fire when a matching scheduled/catchup run already exists at or after the expected slot", async () => {
    const now = new Date();
    const recentSlot = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][recentSlot.getUTCDay()];
    const hh = String(recentSlot.getUTCHours()).padStart(2, "0");
    const mm = String(recentSlot.getUTCMinutes()).padStart(2, "0");

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [dayName], scheduleTime: `${hh}:${mm}`,
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const db = getDb();
    await db.insert(pipelineRunsTable).values({ startedAt: recentSlot, type: "scheduled", status: "success" });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun").mockResolvedValue(undefined);

    await checkMissedRun();

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("does not fire when the most recent slot is older than 24h", async () => {
    const oldSlot = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30h ago
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][oldSlot.getUTCDay()];
    const hh = String(oldSlot.getUTCHours()).padStart(2, "0");
    const mm = String(oldSlot.getUTCMinutes()).padStart(2, "0");

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [dayName], scheduleTime: `${hh}:${mm}`,
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun");

    await checkMissedRun();

    expect(triggerSpy).not.toHaveBeenCalled();
  });
});
```

Note: the middle two `checkMissedRun` tests derive `scheduleDays`/`scheduleTime` from "now minus 2 hours" rather than a fixed date, so the test is not time-of-year-dependent and won't rot — read this carefully before implementing, the test is deliberately dynamic.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/scheduler/catchup.test.ts`
Expected: FAIL with "Cannot find module './catchup'"

- [ ] **Step 3: Implement**

Create `lib/scheduler/catchup.ts`:

```typescript
// lib/scheduler/catchup.ts
/**
 * Startup-only missed-run check: computes the most recent scheduled slot
 * that should already have occurred, and fires one catch-up run if nothing
 * covers it yet and it's still within 24h. Never a queue — at most one
 * catch-up run per startup, for the single most recent missed slot. See
 * vault-sift/features/SCHEDULER/SCHEDULER--architecture.md.
 */
import { and, gte, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { pipelineRunsTable } from "../db/schema";
import { getSettings } from "../config/settings";
import { triggerRun } from "./trigger";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const CATCHUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function mostRecentExpectedSlot(scheduleDays: string[], scheduleTime: string, now: Date): Date | null {
  if (scheduleDays.length === 0) return null;

  const [hour, minute] = scheduleTime.split(":").map(Number);
  const scheduledDays = new Set(scheduleDays);

  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() - daysAgo);
    candidate.setUTCHours(hour, minute, 0, 0);
    if (scheduledDays.has(DAY_NAMES[candidate.getUTCDay()]) && candidate.getTime() <= now.getTime()) {
      return candidate;
    }
  }
  return null;
}

export async function checkMissedRun(): Promise<void> {
  const settings = await getSettings();
  const expectedSlot = mostRecentExpectedSlot(settings.scheduleDays, settings.scheduleTime, new Date());
  if (!expectedSlot) return;

  const db = getDb();
  const existing = await db
    .select()
    .from(pipelineRunsTable)
    .where(and(inArray(pipelineRunsTable.type, ["scheduled", "catchup"]), gte(pipelineRunsTable.startedAt, expectedSlot)));
  if (existing.length > 0) return;

  if (Date.now() - expectedSlot.getTime() <= CATCHUP_WINDOW_MS) {
    await triggerRun("catchup");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/scheduler/catchup.test.ts`
Expected: PASS (8/8)

- [ ] **Step 5: Run the full suite and tsc**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/scheduler/catchup.ts lib/scheduler/catchup.test.ts
git commit -m "feat: add 24h missed-run catch-up check"
```

---

### Task 5: Startup wiring + live schedule re-registration

**Files:**
- Create: `lib/scheduler/init.ts`
- Create: `instrumentation.ts` (project root, alongside `next.config.ts`)
- Test: `lib/scheduler/init.test.ts`
- Modify: `app/config/settings/actions.ts`
- Test: append to `app/config/settings/actions.test.ts`

**Interfaces:**
- Produces: `initializeScheduler(): Promise<void>` — registers the cron job from current settings and runs the missed-run check, guarded so it only ever does this once per process even if called more than once.

- [ ] **Step 1: Write the failing test for scheduler init**

Create `lib/scheduler/init.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { initializeScheduler, __resetForTests } from "./init";
import * as settingsModule from "../config/settings";
import * as cronModule from "./cron";
import * as catchupModule from "./catchup";

describe("initializeScheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetForTests();
  });

  it("registers the cron job from current settings and runs the missed-run check", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: ["mon"], scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const registerSpy = vi.spyOn(cronModule, "registerCronJob").mockImplementation(() => {});
    const catchupSpy = vi.spyOn(catchupModule, "checkMissedRun").mockResolvedValue(undefined);

    await initializeScheduler();

    expect(registerSpy).toHaveBeenCalledWith(["mon"], "09:00", expect.any(Function));
    expect(catchupSpy).toHaveBeenCalled();
  });

  it("only initializes once even if called multiple times", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [], scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const catchupSpy = vi.spyOn(catchupModule, "checkMissedRun").mockResolvedValue(undefined);

    await initializeScheduler();
    await initializeScheduler();

    expect(catchupSpy).toHaveBeenCalledTimes(1);
  });
});
```

Note: `__resetForTests` is a test-only export to reset the module-level "already initialized" flag between tests — this is the same kind of test-support export already acceptable in this codebase's style (e.g. `clearRunning()` in `lib/pipeline/run-guard.ts` serves an equivalent purpose for its own guard).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/scheduler/init.test.ts`
Expected: FAIL with "Cannot find module './init'"

- [ ] **Step 3: Implement**

Create `lib/scheduler/init.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/scheduler/init.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Wire it into Next.js's startup hook**

Create `instrumentation.ts` at the project root (same level as `next.config.ts`, `package.json`):

```typescript
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
```

- [ ] **Step 6: Retrofit `saveSchedule` to re-register the cron job live**

Edit `app/config/settings/actions.ts`. Find the `saveSchedule` function from Task 1 of this phase and change it to also re-register the cron job after a successful save:

```typescript
export async function saveSchedule(scheduleDays: string[], scheduleTime: string): Promise<ActionResult> {
  const settings = await getSettings();
  const result = await safeWrite(() => saveSettings({ ...settings, scheduleDays, scheduleTime }));
  if (!result.ok) return result;

  try {
    registerCronJob(scheduleDays, scheduleTime, () => triggerRun("scheduled"));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Saved, but failed to re-register the schedule: ${(err as Error).message}` };
  }
}
```

Add the two new imports this needs (`registerCronJob` from `../../../lib/scheduler/cron`, `triggerRun` from `../../../lib/scheduler/trigger`) to the top of the file.

- [ ] **Step 7: Write the failing test for the live re-registration**

Append to `app/config/settings/actions.test.ts`:

```typescript
it("saveSchedule re-registers the cron job live after a successful save", async () => {
  const registerSpy = vi.spyOn(cronModule, "registerCronJob").mockImplementation(() => {});

  await saveSchedule(["tue"], "11:00");

  expect(registerSpy).toHaveBeenCalledWith(["tue"], "11:00", expect.any(Function));
});

it("saveSchedule surfaces a re-registration failure without losing the persisted save", async () => {
  vi.spyOn(cronModule, "registerCronJob").mockImplementation(() => {
    throw new Error("bad expression");
  });

  const result = await saveSchedule(["wed"], "12:00");

  expect(result.ok).toBe(false);
  expect(result.error).toContain("bad expression");
  const settings = await getSettings();
  expect(settings.scheduleDays).toEqual(["wed"]); // the save itself still happened
});
```

Add `import * as cronModule from "../../../lib/scheduler/cron";` to this test file's imports.

- [ ] **Step 8: Run test to verify it fails, then passes**

Run: `npm test -- app/config/settings/actions.test.ts`
Expected: first FAIL (new tests reference behavior not yet wired in Step 6 if you're doing steps strictly in order — but Step 6 already implements it, so if you followed the plan in order this should PASS immediately). Confirm: PASS (10/10 total in this file).

- [ ] **Step 9: Manually verify in the dev server**

Run: `npm run dev`. Watch the server startup log for confirmation the scheduler initialized (add a `console.log` in your own testing if the existing code doesn't already log this — it's fine either way, just confirm no startup error). Open `/config/settings`, change the schedule, confirm no error. Stop the dev server before finishing.

- [ ] **Step 10: Verify the production build path too**

Run: `npm run build`
Expected: build succeeds, with `instrumentation.ts` picked up (Next.js prints a line confirming instrumentation was detected — check the build output for this). This project uses `output: "standalone"` in `next.config.ts` — confirm the build doesn't error or warn about `instrumentation.ts` being incompatible with that setting. If it does, report this as a concern rather than silently working around it — this is worth a human decision, not a judgment call for you to resolve alone.

- [ ] **Step 11: Run the full suite and tsc**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 12: Commit**

```bash
git add lib/scheduler/init.ts lib/scheduler/init.test.ts instrumentation.ts app/config/settings/actions.ts app/config/settings/actions.test.ts
git commit -m "feat: wire scheduler startup (cron registration + missed-run check) and live schedule re-registration"
```
