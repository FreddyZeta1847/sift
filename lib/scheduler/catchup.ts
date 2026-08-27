// lib/scheduler/catchup.ts
/**
 * Startup-only missed-run check: computes the most recent scheduled slot
 * that should already have occurred, and fires one catch-up run if nothing
 * covers it yet and it's still within 24h. Never a queue — at most one
 * catch-up run per startup, for the single most recent missed slot. See
 * vault-sift/features/SCHEDULER/SCHEDULER--architecture.md.
 *
 * The *check* is awaited (a fast DB read); the *run* it fires is not — see
 * the comment at the trigger site below. This function must always resolve
 * quickly, because nothing in the app is served until it does.
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

  // Walk back a full 8 days (0..7). 7 days covers every day-of-week once;
  // the 8th day is needed for the case where only today's day-of-week is
  // scheduled but today's slot hasn't happened yet — the most recent
  // occurrence is then a full week ago (daysAgo === 7).
  for (let daysAgo = 0; daysAgo < 8; daysAgo++) {
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
    // Deliberately NOT awaited. This runs on the startup path
    // (instrumentation.ts -> initializeScheduler -> here) and Next.js
    // serves no request until register() resolves, so awaiting a full
    // pipeline run here left localhost:3000 hanging for the entire run
    // instead of rendering with a live "running" sidebar. Detaching it is
    // the same shape startRun() already uses for the Run Now button: the
    // pipeline_runs row exists within moments, so getInProgressRun() picks
    // it up and the sidebar polls its currentStage exactly like a manual
    // run. .catch() is mandatory — an unhandled rejection here would kill
    // the server process the detached run was meant to keep alive.
    void triggerRun("catchup").catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[sift] Catch-up run failed to start: ${(err as Error).message}`);
    });
  }
}
