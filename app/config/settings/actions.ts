/**
 * Server Actions for the Settings page (`/config/settings`).
 *
 * `toggleSource`/`addSource` do a full read-modify-write of
 * `config/sources.json` via the Task 7 `getSources`/`saveSources` layer,
 * matching the no-per-row-storage pattern used by provider CRUD in
 * `app/config/api/actions.ts`. There is no delete-source action in this
 * task's scope — disabling a source via `toggleSource` is the only way to
 * remove it from active use.
 *
 * `saveSchedule` is persist-only: it writes `scheduleDays` and `scheduleTime`
 * to `config/settings.json` and nothing else. There is no live cron job to
 * re-register yet — that's SCHEDULER, a later, not-yet-built phase — so this
 * action must never be extended to touch any scheduling runtime.
 *
 * `runNow` reuses the same `checkAndSetRunning`/`clearRunning` guard as
 * Regenerate (see `lib/pipeline/run-guard.ts`) so a manual run can't overlap
 * a scheduled or already-in-flight one. It is a silent no-op (`ok: false`)
 * if a run is already in progress, and always calls `clearRunning()` in a
 * `finally` so the guard can't get stuck set after a thrown error.
 *
 * `saveVoiceProfile`/`saveRetention` are thin read-modify-write wrappers
 * over `config/settings.json`, matching this project's low-ceremony style:
 * the caller always sends the whole current in-memory object rather than a
 * diff.
 *
 * Every action's actual `saveSources`/`saveSettings` write is routed through
 * `lib/config/safe-write.ts`'s `safeWrite` so a genuine I/O failure (disk
 * full, permissions) surfaces as `{ok: false, error}` instead of throwing
 * and rejecting the Server Action unhandled.
 *
 * Note: this project's `"use server"` files must export only
 * locally-declared async functions (bare re-exports fail Next.js's
 * compiler — discovered during a prior task), so this file is written
 * directly, not via re-export.
 */
"use server";

import { getSources, saveSources } from "../../../lib/config/sources";
import { getSettings, saveSettings } from "../../../lib/config/settings";
import { checkAndSetRunning, clearRunning } from "../../../lib/pipeline/run-guard";
import { runPipeline } from "../../../scripts/run-pipeline";
import { safeWrite } from "../../../lib/config/safe-write";
import type { VoiceProfile, Source } from "../../../lib/config/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function toggleSource(name: string): Promise<ActionResult> {
  const sources = await getSources();
  const next = sources.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s));
  return safeWrite(() => saveSources(next));
}

export async function addSource(input: { name: string; url: string; category: string }): Promise<ActionResult> {
  const sources = await getSources();
  const newSource: Source = { ...input, enabled: true };
  return safeWrite(() => saveSources([...sources, newSource]));
}

export async function saveSchedule(scheduleDays: string[], scheduleTime: string): Promise<ActionResult> {
  const settings = await getSettings();
  return safeWrite(() => saveSettings({ ...settings, scheduleDays, scheduleTime }));
}

export async function runNow(): Promise<ActionResult> {
  if (!checkAndSetRunning()) {
    return { ok: false, error: "Already running" };
  }
  try {
    const result = await runPipeline("manual");
    if (result.status === "aborted") {
      return { ok: false, error: `Run aborted: ${result.abortReason}` };
    }
    return { ok: true };
  } finally {
    clearRunning();
  }
}

export async function saveVoiceProfile(profile: VoiceProfile): Promise<ActionResult> {
  const settings = await getSettings();
  return safeWrite(() => saveSettings({ ...settings, voiceProfile: profile }));
}

export async function saveRetention(
  postsRetentionRuns: number | null,
  candidateRetentionDays: number | null
): Promise<ActionResult> {
  const settings = await getSettings();
  return safeWrite(() => saveSettings({ ...settings, postsRetentionRuns, candidateRetentionDays }));
}
